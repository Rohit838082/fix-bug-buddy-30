
-- =========================================================
-- 1. SUBSCRIPTION PLANS (catalog)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  interval text NOT NULL DEFAULT 'month',  -- 'month' | 'year' | 'one_time'
  max_classes integer NOT NULL DEFAULT 0,         -- -1 = unlimited
  max_students_per_class integer NOT NULL DEFAULT 0,
  max_locations_per_class integer NOT NULL DEFAULT 0,
  csv_export boolean NOT NULL DEFAULT false,
  priority_support boolean NOT NULL DEFAULT false,
  stripe_price_id text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_plans TO authenticated, anon;
GRANT ALL    ON public.subscription_plans TO service_role;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_select_all" ON public.subscription_plans
  FOR SELECT TO authenticated, anon USING (true);

-- =========================================================
-- 2. SUBSCRIPTIONS (one row per teacher)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.subscription_plans(id) DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',     -- active | trialing | past_due | canceled | incomplete
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 3. USER STATUS (active / suspended)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',  -- active | suspended
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_status TO authenticated;
GRANT ALL ON public.user_status TO service_role;

ALTER TABLE public.user_status ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 4. HELPERS
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.current_plan(_user_id uuid)
RETURNS public.subscription_plans
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pid text;
  pst text;
  p public.subscription_plans%ROWTYPE;
BEGIN
  SELECT plan_id, status INTO pid, pst
  FROM public.subscriptions WHERE user_id = _user_id;

  -- Default to free if no subscription row or not in a paying status
  IF pid IS NULL OR pst NOT IN ('active','trialing') THEN
    pid := 'free';
  END IF;

  SELECT * INTO p FROM public.subscription_plans WHERE id = pid;
  IF NOT FOUND THEN
    SELECT * INTO p FROM public.subscription_plans WHERE id = 'free';
  END IF;
  RETURN p;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.current_plan(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_plan(uuid) TO authenticated, service_role;

-- =========================================================
-- 5. RLS POLICIES for new tables (now that helpers exist)
-- =========================================================
CREATE POLICY "subs_select_own_or_admin" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "subs_insert_self" ON public.subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "subs_update_admin" ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "ustatus_select_own_or_admin" ON public.user_status
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- =========================================================
-- 6. ADMIN-WIDE READ POLICIES on existing tables
--    (additive — existing policies still apply)
-- =========================================================
CREATE POLICY "profiles_admin_select" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "roles_admin_all" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "classes_admin_select" ON public.classes
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "classes_admin_delete" ON public.classes
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "cs_admin_select" ON public.class_students
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "cl_admin_select" ON public.class_locations
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "sessions_admin_select" ON public.attendance_sessions
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "records_admin_select" ON public.attendance_records
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "tr_admin_all" ON public.teacher_requests
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Admin can read class.password column again (revoked from authenticated, re-grant to admin via RPC if needed in panel)
-- Admin reads happen through has_role checks in server functions; column-level revoke remains.

-- =========================================================
-- 7. PLAN-LIMIT ENFORCEMENT TRIGGERS
-- =========================================================
CREATE OR REPLACE FUNCTION public.enforce_plan_limit_classes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.subscription_plans; cnt integer;
BEGIN
  p := public.current_plan(NEW.teacher_id);
  IF p.max_classes < 0 THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO cnt FROM public.classes WHERE teacher_id = NEW.teacher_id;
  IF cnt >= p.max_classes THEN
    RAISE EXCEPTION 'Your % plan allows up to % classes. Upgrade to add more.', p.name, p.max_classes
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_plan_limit_classes ON public.classes;
CREATE TRIGGER trg_enforce_plan_limit_classes
  BEFORE INSERT ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_classes();

CREATE OR REPLACE FUNCTION public.enforce_plan_limit_students()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE teacher uuid; p public.subscription_plans; cnt integer;
BEGIN
  SELECT teacher_id INTO teacher FROM public.classes WHERE id = NEW.class_id;
  IF teacher IS NULL THEN RETURN NEW; END IF;
  p := public.current_plan(teacher);
  IF p.max_students_per_class < 0 THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO cnt FROM public.class_students WHERE class_id = NEW.class_id;
  IF cnt >= p.max_students_per_class THEN
    RAISE EXCEPTION 'Class is full. Teacher''s % plan allows up to % students per class.', p.name, p.max_students_per_class
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_plan_limit_students ON public.class_students;
CREATE TRIGGER trg_enforce_plan_limit_students
  BEFORE INSERT ON public.class_students
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_students();

CREATE OR REPLACE FUNCTION public.enforce_plan_limit_locations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE teacher uuid; p public.subscription_plans; cnt integer;
BEGIN
  SELECT teacher_id INTO teacher FROM public.classes WHERE id = NEW.class_id;
  IF teacher IS NULL THEN RETURN NEW; END IF;
  p := public.current_plan(teacher);
  IF p.max_locations_per_class < 0 THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO cnt FROM public.class_locations WHERE class_id = NEW.class_id;
  IF cnt >= p.max_locations_per_class THEN
    RAISE EXCEPTION 'Your % plan allows up to % attendance locations per class.', p.name, p.max_locations_per_class
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_plan_limit_locations ON public.class_locations;
CREATE TRIGGER trg_enforce_plan_limit_locations
  BEFORE INSERT ON public.class_locations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_locations();

-- Lock down the new internal trigger functions
REVOKE EXECUTE ON FUNCTION public.enforce_plan_limit_classes()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_plan_limit_students()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_plan_limit_locations() FROM PUBLIC, anon, authenticated;

-- =========================================================
-- 8. SEED PLANS
-- =========================================================
INSERT INTO public.subscription_plans
  (id, name, description, price_cents, interval,
   max_classes, max_students_per_class, max_locations_per_class,
   csv_export, priority_support, sort_order)
VALUES
  ('free',     'Free',     'Get started with attendance tracking',          0, 'month',  2,  30, 1, false, false, 0),
  ('pro',      'Pro',      'For active teachers and full classrooms',     900, 'month', 20, 200, 5, true,  false, 1),
  ('business', 'Business', 'For institutions and unlimited usage',       2900, 'month', -1,  -1,-1, true,  true,  2)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  max_classes = EXCLUDED.max_classes,
  max_students_per_class = EXCLUDED.max_students_per_class,
  max_locations_per_class = EXCLUDED.max_locations_per_class,
  csv_export = EXCLUDED.csv_export,
  priority_support = EXCLUDED.priority_support,
  sort_order = EXCLUDED.sort_order;

-- =========================================================
-- 9. BOOTSTRAP ADMIN — grant admin role to the existing approver email
-- =========================================================
DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower('pvishvajeet52@gmail.com') LIMIT 1;
  IF uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (uid, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

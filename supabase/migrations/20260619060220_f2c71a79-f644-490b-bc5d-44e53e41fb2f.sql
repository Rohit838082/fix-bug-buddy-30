create type public.app_role as enum ('teacher', 'student');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  age integer,
  dob date,
  college text NOT NULL DEFAULT '',
  profile_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

create table public.classes (
  id text primary key,
  password text not null,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null default '',
  section text not null default '',
  semester text not null default '',
  lat double precision not null,
  lng double precision not null,
  radius integer not null default 50,
  active_session boolean not null default false,
  attendance_end_time text,
  created_at timestamptz not null default now()
);
alter table public.classes enable row level security;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;

create table public.class_students (
  class_id text not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);
alter table public.class_students enable row level security;
GRANT SELECT, INSERT, DELETE ON public.class_students TO authenticated;
GRANT ALL ON public.class_students TO service_role;

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references public.classes(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table public.attendance_sessions enable row level security;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_sessions TO authenticated;
GRANT ALL ON public.attendance_sessions TO service_role;

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references public.classes(id) on delete cascade,
  session_id uuid references public.attendance_sessions(id) on delete set null,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('present','outside','absent')),
  distance double precision not null default 0,
  student_lat double precision,
  student_lng double precision,
  attendance_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  created_at timestamptz not null default now()
);
alter table public.attendance_records enable row level security;
GRANT SELECT, INSERT ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
create index attendance_records_student_idx on public.attendance_records(student_id);
create index attendance_records_class_idx on public.attendance_records(class_id);
CREATE UNIQUE INDEX attendance_records_unique_per_day
  ON public.attendance_records (student_id, class_id, attendance_date);

CREATE TABLE public.teacher_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  user_name TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  decision_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teacher_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, user_id, user_name, user_email, status, created_at, decided_at), INSERT ON public.teacher_requests TO authenticated;
GRANT ALL ON public.teacher_requests TO service_role;

CREATE TABLE public.class_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id text NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Location',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  radius integer NOT NULL DEFAULT 50,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX idx_class_locations_class_id ON public.class_locations(class_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_locations TO authenticated;
GRANT ALL ON public.class_locations TO service_role;
ALTER TABLE public.class_locations ENABLE ROW LEVEL SECURITY;

-- Security definer functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_class_teacher(_class_id text, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.classes WHERE id = _class_id AND teacher_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_class_member(_class_id text, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.class_students WHERE class_id = _class_id AND student_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.shares_class_with(_other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c JOIN public.class_students cs ON cs.class_id = c.id
    WHERE c.teacher_id = auth.uid() AND cs.student_id = _other
  ) OR EXISTS (
    SELECT 1 FROM public.class_students cs JOIN public.classes c ON c.id = cs.class_id
    WHERE cs.student_id = auth.uid() AND c.teacher_id = _other
  ) OR EXISTS (
    SELECT 1 FROM public.class_students a JOIN public.class_students b ON a.class_id = b.class_id
    WHERE a.student_id = auth.uid() AND b.student_id = _other
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.join_class(_class_id text, _password text)
RETURNS TABLE(ok boolean, message text, class_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.classes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN QUERY SELECT false, 'Not signed in', ''::text; RETURN; END IF;
  SELECT * INTO c FROM public.classes WHERE id = _class_id;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'Class not found', ''::text; RETURN; END IF;
  IF c.password <> _password THEN RETURN QUERY SELECT false, 'Wrong password', ''::text; RETURN; END IF;
  INSERT INTO public.class_students (class_id, student_id) VALUES (_class_id, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT true, 'Joined', c.id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_class_password(_class_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT password FROM public.classes WHERE id = _class_id AND teacher_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public._haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    sin(radians(($3 - $1) / 2)) ^ 2 + cos(radians($1)) * cos(radians($3)) * sin(radians(($4 - $2) / 2)) ^ 2
  ));
$$;

CREATE OR REPLACE FUNCTION public.app_admin_decide_teacher_request(_token TEXT, _decision TEXT)
RETURNS TABLE(ok BOOLEAN, message TEXT, user_email TEXT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE req public.teacher_requests%ROWTYPE;
BEGIN
  IF _decision NOT IN ('approved','rejected') THEN RETURN QUERY SELECT false, 'Invalid decision', ''::text, ''::text; RETURN; END IF;
  SELECT * INTO req FROM public.teacher_requests WHERE decision_token = _token;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'Invalid or expired token', ''::text, ''::text; RETURN; END IF;
  IF req.status <> 'pending' THEN RETURN QUERY SELECT false, 'Already ' || req.status, req.user_email, req.status; RETURN; END IF;
  UPDATE public.teacher_requests SET status = _decision, decided_at = now() WHERE id = req.id;
  IF _decision = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (req.user_id, 'teacher'::app_role) ON CONFLICT DO NOTHING;
  END IF;
  RETURN QUERY SELECT true, 'Request ' || _decision, req.user_email, _decision;
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_daily_attendance()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_date date := ((now() AT TIME ZONE 'Asia/Kolkata') - interval '1 day')::date;
BEGIN
  INSERT INTO public.attendance_records (class_id, student_id, status, distance, attendance_date, created_at)
  SELECT cs.class_id, cs.student_id, 'absent', 0, target_date,
         ((target_date + time '23:59:59') AT TIME ZONE 'Asia/Kolkata')
  FROM public.class_students cs
  WHERE NOT EXISTS (
    SELECT 1 FROM public.attendance_records ar
    WHERE ar.class_id = cs.class_id AND ar.student_id = cs.student_id AND ar.attendance_date = target_date
  )
  ON CONFLICT (student_id, class_id, attendance_date) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_attendance_deadline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE end_time text; ist_now timestamp; deadline timestamp;
BEGIN
  IF NEW.status <> 'present' THEN RETURN NEW; END IF;
  SELECT attendance_end_time INTO end_time FROM public.classes WHERE id = NEW.class_id;
  IF end_time IS NULL OR end_time = '' THEN RETURN NEW; END IF;
  ist_now := (now() AT TIME ZONE 'Asia/Kolkata');
  deadline := (ist_now::date + end_time::time);
  IF ist_now > deadline THEN
    RAISE EXCEPTION 'Attendance cannot be marked. You are late.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_attendance_geofence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  has_locations boolean; best_dist double precision; best_radius integer;
  fb_lat double precision; fb_lng double precision; fb_radius integer;
BEGIN
  IF NEW.status <> 'present' THEN
    NEW.student_lat := NULL; NEW.student_lng := NULL; RETURN NEW;
  END IF;
  IF NEW.student_lat IS NULL OR NEW.student_lng IS NULL THEN
    RAISE EXCEPTION 'GPS coordinates required to mark attendance.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.student_lat NOT BETWEEN -90 AND 90 OR NEW.student_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Invalid GPS coordinates.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.class_locations WHERE class_id = NEW.class_id) INTO has_locations;
  IF has_locations THEN
    SELECT MIN(public._haversine_m(NEW.student_lat, NEW.student_lng, l.lat, l.lng)),
           (ARRAY_AGG(l.radius ORDER BY public._haversine_m(NEW.student_lat, NEW.student_lng, l.lat, l.lng) ASC))[1]
      INTO best_dist, best_radius
      FROM public.class_locations l WHERE l.class_id = NEW.class_id;
    IF best_dist IS NULL OR best_dist > best_radius THEN
      RAISE EXCEPTION 'Outside approved attendance area.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.distance := best_dist;
  ELSE
    SELECT lat, lng, radius INTO fb_lat, fb_lng, fb_radius FROM public.classes WHERE id = NEW.class_id;
    IF fb_lat IS NULL OR fb_lng IS NULL OR fb_radius IS NULL THEN
      RAISE EXCEPTION 'Outside approved attendance area.' USING ERRCODE = 'check_violation';
    END IF;
    best_dist := public._haversine_m(NEW.student_lat, NEW.student_lng, fb_lat, fb_lng);
    IF best_dist > fb_radius THEN
      RAISE EXCEPTION 'Outside approved attendance area.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.distance := best_dist;
  END IF;
  NEW.student_lat := NULL; NEW.student_lng := NULL;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_attendance_date()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ist_today date := ((now() AT TIME ZONE 'Asia/Kolkata'))::date;
BEGIN
  IF NEW.status = 'present' AND NEW.attendance_date <> ist_today THEN
    RAISE EXCEPTION 'attendance_date must be today (IST).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_enforce_attendance_geofence BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_geofence();
CREATE TRIGGER trg_enforce_attendance_date BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_date();
CREATE TRIGGER trg_enforce_attendance_deadline BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_deadline();

-- RLS Policies
CREATE POLICY profiles_select_scoped ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.shares_class_with(id));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY roles_select_own ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY roles_insert_self_student ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'student'::app_role);

CREATE POLICY classes_teacher_all ON public.classes FOR ALL TO authenticated
  USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY classes_select_member ON public.classes FOR SELECT TO authenticated
  USING (auth.uid() = teacher_id OR public.is_class_member(id, auth.uid()));

CREATE POLICY cs_no_direct_insert ON public.class_students FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY cs_select ON public.class_students FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.is_class_teacher(class_id, auth.uid()));
CREATE POLICY cs_delete ON public.class_students FOR DELETE TO authenticated
  USING (auth.uid() = student_id OR public.is_class_teacher(class_id, auth.uid()));

CREATE POLICY sessions_teacher_all ON public.attendance_sessions FOR ALL TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid())) WITH CHECK (public.is_class_teacher(class_id, auth.uid()));
CREATE POLICY sessions_student_view ON public.attendance_sessions FOR SELECT TO authenticated
  USING (public.is_class_member(class_id, auth.uid()));

CREATE POLICY records_student_insert ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = student_id AND public.is_class_member(class_id, auth.uid())
    AND EXISTS (SELECT 1 FROM public.attendance_sessions s WHERE s.class_id = attendance_records.class_id AND s.ended_at IS NULL)
  );
CREATE POLICY records_select ON public.attendance_records FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.is_class_teacher(class_id, auth.uid()));
CREATE POLICY records_no_update ON public.attendance_records AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY records_no_delete ON public.attendance_records AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE POLICY tr_select_own ON public.teacher_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY tr_insert_own ON public.teacher_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY cl_select ON public.class_locations FOR SELECT TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid()) OR public.is_class_member(class_id, auth.uid()));
CREATE POLICY cl_teacher_all ON public.class_locations FOR ALL TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid())) WITH CHECK (public.is_class_teacher(class_id, auth.uid()));

-- Function privileges
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_class_member(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_class_teacher(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shares_class_with(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_class(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_class_password(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._haversine_m(double precision,double precision,double precision,double precision) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.app_admin_decide_teacher_request(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_daily_attendance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_class_member(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_class_teacher(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_class_with(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_class(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_class_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._haversine_m(double precision,double precision,double precision,double precision) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_admin_decide_teacher_request(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_daily_attendance() TO service_role;

-- Hide password column
REVOKE SELECT (password) ON public.classes FROM authenticated;
REVOKE SELECT (password) ON public.classes FROM anon;

-- Realtime
ALTER TABLE public.classes REPLICA IDENTITY FULL;
ALTER TABLE public.class_students REPLICA IDENTITY FULL;
ALTER TABLE public.attendance_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.attendance_records REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.classes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.class_students;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;

-- Schedule nightly finalize
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('finalize-daily-attendance', '30 18 * * *', $cron$ SELECT public.finalize_daily_attendance(); $cron$);

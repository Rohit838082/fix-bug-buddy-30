
-- 1) subscriptions: drop self-insert policy
DROP POLICY IF EXISTS subs_insert_self ON public.subscriptions;

-- 2) user_roles: drop self-insert policy and add safe RPC
DROP POLICY IF EXISTS roles_insert_self_student ON public.user_roles;

CREATE OR REPLACE FUNCTION public.claim_student_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid) THEN
    RETURN;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'student'::app_role)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_student_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_student_role() TO authenticated;

-- 3) teacher_requests: hide decision_token from authenticated/anon at column level
REVOKE SELECT (decision_token) ON public.teacher_requests FROM authenticated, anon;

-- 4) classes: drop from realtime publication to stop streaming the password column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'classes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.classes';
  END IF;
END$$;

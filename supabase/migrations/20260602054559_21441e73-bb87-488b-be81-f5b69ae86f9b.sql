
-- 1. Profiles: scoped SELECT
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;

CREATE OR REPLACE FUNCTION public.shares_class_with(_other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.class_students cs ON cs.class_id = c.id
    WHERE c.teacher_id = auth.uid() AND cs.student_id = _other
  ) OR EXISTS (
    SELECT 1 FROM public.class_students cs
    JOIN public.classes c ON c.id = cs.class_id
    WHERE cs.student_id = auth.uid() AND c.teacher_id = _other
  ) OR EXISTS (
    SELECT 1 FROM public.class_students a
    JOIN public.class_students b ON a.class_id = b.class_id
    WHERE a.student_id = auth.uid() AND b.student_id = _other
  );
$$;
REVOKE EXECUTE ON FUNCTION public.shares_class_with(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shares_class_with(uuid) TO authenticated;

CREATE POLICY profiles_select_scoped ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.shares_class_with(id));

-- 2. Classes: hide passwords from non-members
DROP POLICY IF EXISTS classes_select_all ON public.classes;
CREATE POLICY classes_select_member ON public.classes
  FOR SELECT TO authenticated
  USING (auth.uid() = teacher_id OR public.is_class_member(id, auth.uid()));

-- 3. Secure join function so students don't need direct password access
CREATE OR REPLACE FUNCTION public.join_class(_class_id text, _password text)
RETURNS TABLE(ok boolean, message text, class_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.classes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'Not signed in', ''::text; RETURN;
  END IF;
  SELECT * INTO c FROM public.classes WHERE id = _class_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Class not found', ''::text; RETURN;
  END IF;
  IF c.password <> _password THEN
    RETURN QUERY SELECT false, 'Wrong password', ''::text; RETURN;
  END IF;
  INSERT INTO public.class_students (class_id, student_id)
    VALUES (_class_id, auth.uid())
    ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT true, 'Joined', c.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.join_class(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_class(text, text) TO authenticated;

-- 4. teacher_requests: hide decision_token via column privileges
REVOKE SELECT ON public.teacher_requests FROM authenticated;
GRANT SELECT (id, user_id, user_name, user_email, status, created_at, decided_at)
  ON public.teacher_requests TO authenticated;

-- 5. user_roles: prevent self-escalation to teacher/admin
DROP POLICY IF EXISTS roles_insert_own ON public.user_roles;
CREATE POLICY roles_insert_self_student ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'student'::app_role);

-- 6. attendance_records: require membership + active session
DROP POLICY IF EXISTS records_student_insert ON public.attendance_records;
CREATE POLICY records_student_insert ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = student_id
    AND public.is_class_member(class_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.attendance_sessions s
      WHERE s.class_id = attendance_records.class_id
        AND s.ended_at IS NULL
    )
  );

-- 7. Revoke EXECUTE on admin/internal SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.app_admin_decide_teacher_request(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_admin_decide_teacher_request(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_daily_attendance() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_daily_attendance() TO service_role;

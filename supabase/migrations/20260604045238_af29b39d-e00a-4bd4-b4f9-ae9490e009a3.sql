DROP POLICY IF EXISTS cs_insert_self ON public.class_students;
CREATE POLICY cs_no_direct_insert ON public.class_students
  FOR INSERT TO authenticated
  WITH CHECK (false);
-- Enrollment must go through public.join_class(_class_id, _password), which runs
-- as SECURITY DEFINER (owner = postgres) and bypasses RLS after verifying the
-- class password.
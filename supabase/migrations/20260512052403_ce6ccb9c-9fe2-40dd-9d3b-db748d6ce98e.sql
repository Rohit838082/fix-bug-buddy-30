
-- Security definer helpers to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.is_class_teacher(_class_id text, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.classes WHERE id = _class_id AND teacher_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_class_member(_class_id text, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.class_students WHERE class_id = _class_id AND student_id = _user_id)
$$;

-- CLASSES: drop & recreate
DROP POLICY IF EXISTS classes_join_lookup ON public.classes;
DROP POLICY IF EXISTS classes_student_view ON public.classes;
DROP POLICY IF EXISTS classes_teacher_all ON public.classes;

CREATE POLICY classes_teacher_all ON public.classes
  FOR ALL TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

-- Allow any authenticated user to SELECT classes (needed for join lookup and student view).
-- Password is the gate for joining; teacher_id scopes "my classes" in the app.
CREATE POLICY classes_select_all ON public.classes
  FOR SELECT TO authenticated
  USING (true);

-- CLASS_STUDENTS
DROP POLICY IF EXISTS cs_delete ON public.class_students;
DROP POLICY IF EXISTS cs_insert_self ON public.class_students;
DROP POLICY IF EXISTS cs_select ON public.class_students;

CREATE POLICY cs_insert_self ON public.class_students
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY cs_select ON public.class_students
  FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.is_class_teacher(class_id, auth.uid()));

CREATE POLICY cs_delete ON public.class_students
  FOR DELETE TO authenticated
  USING (auth.uid() = student_id OR public.is_class_teacher(class_id, auth.uid()));

-- ATTENDANCE_SESSIONS
DROP POLICY IF EXISTS sessions_student_view ON public.attendance_sessions;
DROP POLICY IF EXISTS sessions_teacher_all ON public.attendance_sessions;

CREATE POLICY sessions_teacher_all ON public.attendance_sessions
  FOR ALL TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid()))
  WITH CHECK (public.is_class_teacher(class_id, auth.uid()));

CREATE POLICY sessions_student_view ON public.attendance_sessions
  FOR SELECT TO authenticated
  USING (public.is_class_member(class_id, auth.uid()));

-- ATTENDANCE_RECORDS
DROP POLICY IF EXISTS records_select ON public.attendance_records;
DROP POLICY IF EXISTS records_student_insert ON public.attendance_records;

CREATE POLICY records_student_insert ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY records_select ON public.attendance_records
  FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.is_class_teacher(class_id, auth.uid()));

-- Realtime
ALTER TABLE public.classes REPLICA IDENTITY FULL;
ALTER TABLE public.class_students REPLICA IDENTITY FULL;
ALTER TABLE public.attendance_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.attendance_records REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.classes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.class_students;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_sessions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

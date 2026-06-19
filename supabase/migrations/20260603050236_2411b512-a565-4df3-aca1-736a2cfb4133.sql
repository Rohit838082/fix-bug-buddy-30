
ALTER PUBLICATION supabase_realtime
  SET TABLE public.classes (id, teacher_id, name, subject, section, semester, lat, lng, radius, active_session, created_at, attendance_end_time);

ALTER PUBLICATION supabase_realtime
  SET TABLE public.attendance_records (id, class_id, session_id, student_id, status, distance, created_at, attendance_date);

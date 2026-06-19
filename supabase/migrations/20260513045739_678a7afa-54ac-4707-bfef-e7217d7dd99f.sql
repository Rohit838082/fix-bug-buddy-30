
-- 1) attendance_date column (IST)
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS attendance_date date;

UPDATE public.attendance_records
  SET attendance_date = ((created_at AT TIME ZONE 'Asia/Kolkata')::date)
  WHERE attendance_date IS NULL;

ALTER TABLE public.attendance_records
  ALTER COLUMN attendance_date SET NOT NULL,
  ALTER COLUMN attendance_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date);

-- 2) Unique constraint: one record per student/class/date
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_unique_per_day
  ON public.attendance_records (student_id, class_id, attendance_date);

-- 3) Cascade deletes when a class is removed
ALTER TABLE public.class_students
  DROP CONSTRAINT IF EXISTS class_students_class_id_fkey,
  ADD CONSTRAINT class_students_class_id_fkey
    FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;

ALTER TABLE public.attendance_sessions
  DROP CONSTRAINT IF EXISTS attendance_sessions_class_id_fkey,
  ADD CONSTRAINT attendance_sessions_class_id_fkey
    FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_class_id_fkey,
  ADD CONSTRAINT attendance_records_class_id_fkey
    FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;

-- 4) Midnight finalization function (runs as definer; bypasses RLS)
CREATE OR REPLACE FUNCTION public.finalize_daily_attendance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_date date := ((now() AT TIME ZONE 'Asia/Kolkata') - interval '1 day')::date;
BEGIN
  INSERT INTO public.attendance_records
    (class_id, student_id, status, distance, attendance_date, created_at)
  SELECT cs.class_id, cs.student_id, 'absent', 0, target_date,
         ((target_date + time '23:59:59') AT TIME ZONE 'Asia/Kolkata')
  FROM public.class_students cs
  WHERE NOT EXISTS (
    SELECT 1 FROM public.attendance_records ar
    WHERE ar.class_id = cs.class_id
      AND ar.student_id = cs.student_id
      AND ar.attendance_date = target_date
  )
  ON CONFLICT (student_id, class_id, attendance_date) DO NOTHING;
END;
$$;

-- 5) Schedule nightly via pg_cron at 00:00 IST = 18:30 UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finalize-daily-attendance') THEN
    PERFORM cron.unschedule('finalize-daily-attendance');
  END IF;
END $$;

SELECT cron.schedule(
  'finalize-daily-attendance',
  '30 18 * * *',
  $cron$ SELECT public.finalize_daily_attendance(); $cron$
);

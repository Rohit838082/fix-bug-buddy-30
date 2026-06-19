
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS attendance_end_time text;

CREATE OR REPLACE FUNCTION public.enforce_attendance_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  end_time text;
  ist_now timestamp;
  deadline timestamp;
BEGIN
  IF NEW.status <> 'present' THEN
    RETURN NEW;
  END IF;
  SELECT attendance_end_time INTO end_time FROM public.classes WHERE id = NEW.class_id;
  IF end_time IS NULL OR end_time = '' THEN
    RETURN NEW;
  END IF;
  ist_now := (now() AT TIME ZONE 'Asia/Kolkata');
  deadline := (ist_now::date + end_time::time);
  IF ist_now > deadline THEN
    RAISE EXCEPTION 'Attendance cannot be marked. You are late.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_attendance_deadline ON public.attendance_records;
CREATE TRIGGER trg_enforce_attendance_deadline
BEFORE INSERT ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_deadline();

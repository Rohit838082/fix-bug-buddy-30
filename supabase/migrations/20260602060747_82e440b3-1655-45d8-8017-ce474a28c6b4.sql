-- Add raw GPS coords to attendance_records and validate them server-side
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS student_lat double precision,
  ADD COLUMN IF NOT EXISTS student_lng double precision;

-- Pure-SQL haversine helper (meters)
CREATE OR REPLACE FUNCTION public._haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    sin(radians(($3 - $1) / 2)) ^ 2
    + cos(radians($1)) * cos(radians($3)) * sin(radians(($4 - $2) / 2)) ^ 2
  ));
$$;

REVOKE EXECUTE ON FUNCTION public._haversine_m(double precision,double precision,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._haversine_m(double precision,double precision,double precision,double precision) TO authenticated, service_role;

-- Replace geofence trigger: independently compute distance from submitted lat/lng,
-- ignore client-supplied distance, and reject if outside every approved radius.
CREATE OR REPLACE FUNCTION public.enforce_attendance_geofence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  has_locations boolean;
  best_dist double precision;
  best_radius integer;
  fb_lat double precision;
  fb_lng double precision;
  fb_radius integer;
BEGIN
  IF NEW.status <> 'present' THEN
    RETURN NEW;
  END IF;

  IF NEW.student_lat IS NULL OR NEW.student_lng IS NULL THEN
    RAISE EXCEPTION 'GPS coordinates required to mark attendance.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.student_lat NOT BETWEEN -90 AND 90 OR NEW.student_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Invalid GPS coordinates.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.class_locations WHERE class_id = NEW.class_id) INTO has_locations;

  IF has_locations THEN
    SELECT MIN(public._haversine_m(NEW.student_lat, NEW.student_lng, l.lat, l.lng)) AS d,
           (ARRAY_AGG(l.radius ORDER BY public._haversine_m(NEW.student_lat, NEW.student_lng, l.lat, l.lng) ASC))[1]
      INTO best_dist, best_radius
      FROM public.class_locations l
     WHERE l.class_id = NEW.class_id;

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

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_attendance_geofence ON public.attendance_records;
CREATE TRIGGER trg_enforce_attendance_geofence
  BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_geofence();

-- Enforce attendance_date = today's IST date server-side
CREATE OR REPLACE FUNCTION public.enforce_attendance_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  ist_today date := ((now() AT TIME ZONE 'Asia/Kolkata'))::date;
BEGIN
  IF NEW.status = 'present' AND NEW.attendance_date <> ist_today THEN
    RAISE EXCEPTION 'attendance_date must be today (IST).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_attendance_date ON public.attendance_records;
CREATE TRIGGER trg_enforce_attendance_date
  BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_date();

-- Re-ensure the deadline trigger is attached (was created previously as a function)
DROP TRIGGER IF EXISTS trg_enforce_attendance_deadline ON public.attendance_records;
CREATE TRIGGER trg_enforce_attendance_deadline
  BEFORE INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_deadline();

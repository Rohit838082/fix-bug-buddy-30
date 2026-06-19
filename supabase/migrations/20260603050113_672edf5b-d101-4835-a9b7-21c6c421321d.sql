
-- 1) Hide classes.password from non-teachers via column-level privileges + RPC for teachers.
REVOKE SELECT (password) ON public.classes FROM authenticated;
REVOKE SELECT (password) ON public.classes FROM anon;

CREATE OR REPLACE FUNCTION public.get_class_password(_class_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT password FROM public.classes
   WHERE id = _class_id AND teacher_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_class_password(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_class_password(text) TO authenticated;

-- 2) Stop retaining raw student GPS after the geofence trigger validates.
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
    -- Even for non-present rows, do not retain raw GPS.
    NEW.student_lat := NULL;
    NEW.student_lng := NULL;
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

  -- Discard raw coordinates once geofence has been validated. Only the
  -- aggregated `distance` (and a present/absent status) is retained.
  NEW.student_lat := NULL;
  NEW.student_lng := NULL;

  RETURN NEW;
END;
$function$;

-- Backfill: scrub any historical raw GPS that was retained before this change.
UPDATE public.attendance_records
   SET student_lat = NULL, student_lng = NULL
 WHERE student_lat IS NOT NULL OR student_lng IS NOT NULL;

-- 3) Explicitly deny UPDATE/DELETE on attendance_records (defense in depth;
-- with RLS enabled and no permissive policy, Postgres already denies, but a
-- restrictive policy makes the intent explicit and survives future grants).
DROP POLICY IF EXISTS records_no_update ON public.attendance_records;
CREATE POLICY records_no_update
  ON public.attendance_records
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS records_no_delete ON public.attendance_records;
CREATE POLICY records_no_delete
  ON public.attendance_records
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

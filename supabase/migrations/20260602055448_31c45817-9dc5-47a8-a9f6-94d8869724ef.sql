-- 1) Lock down EXECUTE on SECURITY DEFINER helpers: revoke from PUBLIC/anon, grant only to roles that need it
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_class_member(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_class_teacher(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shares_class_with(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_class(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.app_admin_decide_teacher_request(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_daily_attendance() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_class_member(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_class_teacher(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_class_with(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_class(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_admin_decide_teacher_request(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_daily_attendance() TO service_role;

-- 2) Server-side geofence enforcement: reject 'present' inserts where distance exceeds nearest approved location's radius.
CREATE OR REPLACE FUNCTION public.enforce_attendance_geofence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  min_radius integer;
  reported_dist double precision := COALESCE(NEW.distance, 1e12);
  has_locations boolean;
  fallback_radius integer;
BEGIN
  IF NEW.status <> 'present' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.class_locations WHERE class_id = NEW.class_id) INTO has_locations;

  IF has_locations THEN
    -- Find the smallest radius among locations whose radius >= reported distance.
    -- If none, the student is outside every approved location.
    SELECT MIN(radius) INTO min_radius
      FROM public.class_locations
     WHERE class_id = NEW.class_id
       AND radius >= reported_dist;

    IF min_radius IS NULL THEN
      RAISE EXCEPTION 'Outside approved attendance area.' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- Legacy single-location fallback on classes.radius
    SELECT radius INTO fallback_radius FROM public.classes WHERE id = NEW.class_id;
    IF fallback_radius IS NULL OR reported_dist > fallback_radius THEN
      RAISE EXCEPTION 'Outside approved attendance area.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_attendance_geofence ON public.attendance_records;
CREATE TRIGGER trg_enforce_attendance_geofence
BEFORE INSERT ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_geofence();
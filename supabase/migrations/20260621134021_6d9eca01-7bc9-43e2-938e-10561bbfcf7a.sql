
REVOKE SELECT (password) ON public.classes FROM authenticated, anon;
REVOKE SELECT (decision_token) ON public.teacher_requests FROM authenticated, anon;

REVOKE EXECUTE ON FUNCTION public._haversine_m(double precision, double precision, double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_attendance_geofence() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_attendance_deadline() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_attendance_date() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_daily_attendance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.app_admin_decide_teacher_request(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.app_admin_decide_teacher_request(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_daily_attendance() TO service_role;

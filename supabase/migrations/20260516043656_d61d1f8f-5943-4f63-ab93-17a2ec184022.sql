
CREATE TABLE public.teacher_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  user_name TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  decision_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tr_select_own" ON public.teacher_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "tr_insert_own" ON public.teacher_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.app_admin_decide_teacher_request(
  _token TEXT,
  _decision TEXT
) RETURNS TABLE(ok BOOLEAN, message TEXT, user_email TEXT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  req public.teacher_requests%ROWTYPE;
BEGIN
  IF _decision NOT IN ('approved','rejected') THEN
    RETURN QUERY SELECT false, 'Invalid decision', ''::text, ''::text; RETURN;
  END IF;
  SELECT * INTO req FROM public.teacher_requests WHERE decision_token = _token;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invalid or expired token', ''::text, ''::text; RETURN;
  END IF;
  IF req.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'Already ' || req.status, req.user_email, req.status; RETURN;
  END IF;
  UPDATE public.teacher_requests
    SET status = _decision, decided_at = now()
    WHERE id = req.id;
  IF _decision = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role)
      VALUES (req.user_id, 'teacher'::app_role)
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN QUERY SELECT true, 'Request ' || _decision, req.user_email, _decision;
END;
$$;

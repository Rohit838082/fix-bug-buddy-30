
CREATE TABLE public.app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  payment_qr_url text,
  payment_instructions text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.app_settings TO authenticated, anon;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads app_settings"
  ON public.app_settings FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "admin updates app_settings"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.subscription_plans(id),
  billing_interval text NOT NULL CHECK (billing_interval IN ('month','year')),
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  screenshot_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id)
);

CREATE INDEX purchase_requests_user_idx ON public.purchase_requests(user_id);
CREATE INDEX purchase_requests_status_idx ON public.purchase_requests(status);

GRANT SELECT, INSERT ON public.purchase_requests TO authenticated;
GRANT ALL ON public.purchase_requests TO service_role;
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own purchase requests"
  ON public.purchase_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users create own purchase requests"
  ON public.purchase_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "admin updates purchase requests"
  ON public.purchase_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS price_cents_yearly integer NOT NULL DEFAULT 0;

CREATE POLICY "plans_admin_update" ON public.subscription_plans
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT UPDATE ON public.subscription_plans TO authenticated;
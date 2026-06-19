
-- 1. Profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS college text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT false;

-- 2. class_locations table
CREATE TABLE IF NOT EXISTS public.class_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id text NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Location',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  radius integer NOT NULL DEFAULT 50,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_locations_class_id ON public.class_locations(class_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_locations TO authenticated;
GRANT ALL ON public.class_locations TO service_role;

ALTER TABLE public.class_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY cl_select ON public.class_locations
  FOR SELECT TO authenticated
  USING (
    public.is_class_teacher(class_id, auth.uid())
    OR public.is_class_member(class_id, auth.uid())
  );

CREATE POLICY cl_teacher_all ON public.class_locations
  FOR ALL TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid()))
  WITH CHECK (public.is_class_teacher(class_id, auth.uid()));

-- 3. Backfill existing classes as their first location
INSERT INTO public.class_locations (class_id, name, lat, lng, radius)
SELECT c.id, 'Main Location', c.lat, c.lng, c.radius
FROM public.classes c
WHERE NOT EXISTS (
  SELECT 1 FROM public.class_locations cl WHERE cl.class_id = c.id
);

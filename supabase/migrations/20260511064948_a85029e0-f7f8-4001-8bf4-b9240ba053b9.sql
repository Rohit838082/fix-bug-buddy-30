
create type public.app_role as enum ('teacher', 'student');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create table public.classes (
  id text primary key,
  password text not null,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null default '',
  section text not null default '',
  semester text not null default '',
  lat double precision not null,
  lng double precision not null,
  radius integer not null default 50,
  active_session boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.classes enable row level security;

create table public.class_students (
  class_id text not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);
alter table public.class_students enable row level security;

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references public.classes(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table public.attendance_sessions enable row level security;

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references public.classes(id) on delete cascade,
  session_id uuid references public.attendance_sessions(id) on delete set null,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('present','outside')),
  distance double precision not null default 0,
  created_at timestamptz not null default now()
);
alter table public.attendance_records enable row level security;
create index attendance_records_student_idx on public.attendance_records(student_id);
create index attendance_records_class_idx on public.attendance_records(class_id);

-- functions
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.get_user_role(_user_id uuid)
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = _user_id limit 1
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- policies
create policy "profiles_select_all" on public.profiles for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);

create policy "roles_select_own" on public.user_roles for select to authenticated using (auth.uid() = user_id);
create policy "roles_insert_own" on public.user_roles for insert to authenticated with check (auth.uid() = user_id);

create policy "classes_teacher_all" on public.classes for all to authenticated
  using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
create policy "classes_student_view" on public.classes for select to authenticated
  using (exists (select 1 from public.class_students cs where cs.class_id = classes.id and cs.student_id = auth.uid()));
-- Allow students to view a class by id+password when joining (any authenticated user can SELECT to validate)
create policy "classes_join_lookup" on public.classes for select to authenticated using (true);

create policy "cs_insert_self" on public.class_students for insert to authenticated with check (auth.uid() = student_id);
create policy "cs_select" on public.class_students for select to authenticated
  using (auth.uid() = student_id or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));
create policy "cs_delete" on public.class_students for delete to authenticated
  using (auth.uid() = student_id or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

create policy "sessions_teacher_all" on public.attendance_sessions for all to authenticated
  using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
  with check (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));
create policy "sessions_student_view" on public.attendance_sessions for select to authenticated
  using (exists (select 1 from public.class_students cs where cs.class_id = attendance_sessions.class_id and cs.student_id = auth.uid()));

create policy "records_student_insert" on public.attendance_records for insert to authenticated
  with check (auth.uid() = student_id);
create policy "records_select" on public.attendance_records for select to authenticated
  using (auth.uid() = student_id or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

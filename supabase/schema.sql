-- ============================================================
-- SEMAI — Supabase schema
-- Run this once in your Supabase project's SQL Editor
-- (Project → SQL Editor → New query → paste → Run)
-- ============================================================

create extension if not exists "pgcrypto";

-- ── Institutions ───────────────────────────────────────────────────────────
-- A real entity, not free text — this is what makes course catalogs and
-- student rosters isolated per university rather than shared across everyone.
create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  contact_email text default '',
  created_at timestamptz default now()
);

-- ── Profiles ───────────────────────────────────────────────────────────────
-- One row per Supabase Auth user — lecturers, students, AND institution admins
-- all share this table, distinguished by `role`. Created automatically on
-- sign-up (see trigger below).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  institution text,                    -- legacy free-text field, kept for backward display compat
  institution_id uuid references public.institutions(id),
  role text not null default 'lecturer' check (role in ('lecturer','student','institution_admin')),
  created_at timestamptz default now()
);

-- Signup metadata shape, passed via supabase.auth.signUp({ options: { data: {...} } }):
--   { name, role: 'lecturer'|'student', institutionId: '<uuid of existing institution>' }
--     — joins an existing institution with the given role.
--   { name, newInstitutionName: 'Some University' }
--     — registers a brand-new institution; the signing-up user always becomes its
--       institution_admin regardless of any role value passed alongside it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
declare
  meta jsonb := new.raw_user_meta_data;
  target_institution_id uuid;
  new_inst_name text;
  chosen_role text;
begin
  chosen_role := coalesce(meta->>'role', 'lecturer');
  if chosen_role not in ('lecturer','student','institution_admin') then
    chosen_role := 'lecturer';
  end if;

  new_inst_name := trim(coalesce(meta->>'newInstitutionName', ''));
  if new_inst_name <> '' then
    insert into public.institutions (name, slug)
    values (
      new_inst_name,
      lower(regexp_replace(new_inst_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(new.id::text, 1, 6)
    )
    returning id into target_institution_id;
    chosen_role := 'institution_admin';
  else
    target_institution_id := nullif(meta->>'institutionId', '')::uuid;
  end if;

  insert into public.profiles (id, name, institution, institution_id, role)
  values (
    new.id,
    coalesce(meta->>'name', new.email),
    meta->>'institution',
    target_institution_id,
    chosen_role
  );
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Courses ────────────────────────────────────────────────────────────────
create table if not exists public.courses (
  id text primary key,                 -- slugified title, e.g. "bus-220-principles-of-marketing"
  title text not null,
  description text default '',
  subject text default '',             -- e.g. "Marketing", "Java Programming", "World History"
  outline text default '',             -- raw source text the lecturer pasted / uploaded
  lecturer_id uuid references auth.users(id) on delete set null,
  lecturer_name text default '',
  institution text default '',         -- legacy free-text field, kept for backward display compat
  institution_id uuid references public.institutions(id),
  created_at timestamptz default now()
);

-- ── Modules ────────────────────────────────────────────────────────────────
create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id text references public.courses(id) on delete cascade,
  position int not null default 0,
  icon text default '',
  title text not null,
  practical_type text default 'none',      -- 'code' | 'example' | 'none'
  practical_language text default '',      -- e.g. 'java', 'python' — only when practical_type = 'code'
  practical text default '',               -- code OR worked-example text
  practical_note text default ''           -- caption explaining the practical section
);

-- ── Slides ─────────────────────────────────────────────────────────────────
create table if not exists public.slides (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references public.modules(id) on delete cascade,
  position int not null default 0,
  title text not null,
  bullets jsonb not null default '[]'::jsonb,
  subtitle text default '',    -- one-sentence framing line shown under the slide title
  highlight text default ''    -- optional standout fact/quote, used sparingly
);

-- ── Student progress ─────────────────────────────────────────────────────────
create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,          -- legacy/display field
  student_id uuid references auth.users(id),
  course_id text references public.courses(id) on delete cascade,
  module_id uuid references public.modules(id) on delete set null,
  slide_index int default 0,
  completed boolean default false,
  updated_at timestamptz default now(),
  constraint progress_student_course_module_unique unique (student_id, course_id, module_id)
);

create index if not exists modules_course_id_idx on public.modules(course_id);
create index if not exists slides_module_id_idx on public.slides(module_id);
create index if not exists progress_course_student_idx on public.progress(course_id, student_name);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.institutions enable row level security;
alter table public.profiles     enable row level security;
alter table public.courses      enable row level security;
alter table public.modules      enable row level security;
alter table public.slides       enable row level security;
alter table public.progress     enable row level security;

-- Institution names and profile names/roles are not sensitive — readable by anyone,
-- including unauthenticated visitors, since signup pickers need this before a session exists.
create policy "institutions readable by anyone" on public.institutions for select using (true);
create policy "profiles readable by anyone" on public.profiles for select using (true);
create policy "users manage own profile" on public.profiles for update using (auth.uid() = id);
-- No insert/update/delete policy on institutions for anon/authenticated roles — institutions
-- are only ever created via the handle_new_user trigger (SECURITY DEFINER above).

-- Courses/modules/slides: readable within your own institution (or by the owning lecturer
-- regardless of institution). institution_id is null for anything created before this scoping
-- was added — that stays visible to everyone rather than becoming orphaned.
create policy "courses readable within institution" on public.courses
  for select using (
    institution_id is null
    or auth.uid() = lecturer_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.institution_id = courses.institution_id)
  );

create policy "modules readable within institution" on public.modules
  for select using (
    exists (
      select 1 from public.courses c
      where c.id = modules.course_id
        and (
          c.institution_id is null
          or c.lecturer_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.institution_id = c.institution_id)
        )
    )
  );

create policy "slides readable within institution" on public.slides
  for select using (
    exists (
      select 1 from public.modules m join public.courses c on c.id = m.course_id
      where m.id = slides.module_id
        and (
          c.institution_id is null
          or c.lecturer_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.institution_id = c.institution_id)
        )
    )
  );

-- Lecturers can create/update/delete their OWN courses (and that course's modules/slides)
-- directly from the frontend — ownership enforced here in Postgres, not in a backend layer.
create policy "lecturers insert own courses" on public.courses
  for insert with check (auth.uid() = lecturer_id);
create policy "lecturers update own courses" on public.courses
  for update using (auth.uid() = lecturer_id) with check (auth.uid() = lecturer_id);
create policy "lecturers delete own courses" on public.courses
  for delete using (auth.uid() = lecturer_id);

create policy "lecturers insert modules for own courses" on public.modules
  for insert with check (exists (select 1 from public.courses c where c.id = modules.course_id and c.lecturer_id = auth.uid()));
create policy "lecturers update modules for own courses" on public.modules
  for update using (exists (select 1 from public.courses c where c.id = modules.course_id and c.lecturer_id = auth.uid()));
create policy "lecturers delete modules for own courses" on public.modules
  for delete using (exists (select 1 from public.courses c where c.id = modules.course_id and c.lecturer_id = auth.uid()));

create policy "lecturers insert slides for own courses" on public.slides
  for insert with check (
    exists (select 1 from public.modules m join public.courses c on c.id = m.course_id where m.id = slides.module_id and c.lecturer_id = auth.uid())
  );
create policy "lecturers update slides for own courses" on public.slides
  for update using (
    exists (select 1 from public.modules m join public.courses c on c.id = m.course_id where m.id = slides.module_id and c.lecturer_id = auth.uid())
  );
create policy "lecturers delete slides for own courses" on public.slides
  for delete using (
    exists (select 1 from public.modules m join public.courses c on c.id = m.course_id where m.id = slides.module_id and c.lecturer_id = auth.uid())
  );

-- Progress: students manage their own rows; lecturers/institution_admins can view progress
-- for courses within their own institution (this is what the admin dashboard reads from).
create policy "students manage own progress" on public.progress
  for all using (auth.uid() = student_id) with check (auth.uid() = student_id);

create policy "staff view progress for their institution" on public.progress
  for select using (
    exists (
      select 1 from public.courses c
      join public.profiles p on p.id = auth.uid()
      where c.id = progress.course_id
        and p.role in ('lecturer','institution_admin')
        and c.institution_id = p.institution_id
    )
  );

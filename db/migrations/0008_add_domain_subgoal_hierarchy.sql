-- Add hierarchical grouping above the existing flat competencies list,
-- per the APSC IVUS Competency Consensus Statement.
-- Domain (Level 1) -> Subgoal (Level 2) -> Competency (Level 3, existing).

-- Domains: Level 1 of the HTA hierarchy. Reference data, expected to be small (4 rows for IVUS).
create table public.domains (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  position integer not null default 0,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.domains is
  'Level 1 of the HTA competency hierarchy. Currently IVUS-only; multi-modality redesign pending.';

-- Subgoals: Level 2 of the HTA hierarchy. Children of domains.
create table public.subgoals (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.domains(id) on delete restrict,
  name text not null,
  code text not null,
  position integer not null default 0,
  description text,
  created_at timestamptz not null default now(),
  unique (domain_id, code)
);

comment on table public.subgoals is
  'Level 2 of the HTA competency hierarchy. Each belongs to exactly one domain.';

-- Add subgoal_id to competencies. Nullable for now so the migration applies cleanly;
-- the user will populate this manually in Table Editor, then a follow-up migration
-- will add the NOT NULL constraint.
alter table public.competencies
  add column subgoal_id uuid references public.subgoals(id) on delete restrict;

comment on column public.competencies.subgoal_id is
  'Subgoal this competency belongs to. Currently nullable; will become NOT NULL after backfill.';

-- Mirror the column on the staging table so proposals can carry a subgoal selection
-- through the propose -> vote -> merge lifecycle.
alter table public.competencies_stage
  add column subgoal_id uuid references public.subgoals(id) on delete restrict;

comment on column public.competencies_stage.subgoal_id is
  'Subgoal proposed for this competency. Flows to competencies.subgoal_id on merge.';

-- RLS: domains and subgoals are read-only reference data, readable by all authenticated users.
-- Mutations happen via admin client (service role bypasses RLS).
alter table public.domains enable row level security;
alter table public.subgoals enable row level security;

create policy "domains readable by authenticated"
  on public.domains for select
  to authenticated
  using (true);

create policy "subgoals readable by authenticated"
  on public.subgoals for select
  to authenticated
  using (true);

-- Index for the most common query: "list all competencies in subgoal X".
create index competencies_subgoal_id_idx on public.competencies(subgoal_id);

-- Update chair_create_competency to accept and persist subgoal_id.
-- New optional p_subgoal_id parameter, nullable to match the in-between state of
-- competencies.subgoal_id. Once that column is made NOT NULL in a follow-up,
-- this function should be tightened to require it.
create or replace function public.chair_create_competency(
  p_name text,
  p_difficulty text,
  p_tags uuid[] default '{}',
  p_subgoal_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  caller uuid := auth.uid();
  is_chair boolean := false;
  new_id uuid;
  next_position integer;
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = caller
      and p.role = 'committee'::public.user_role
      and p.committee_role = 'chief_editor'
  ) into is_chair;

  if not is_chair then
    raise exception 'Only committee chair can add competencies';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Competency name is required';
  end if;

  if p_difficulty is null or p_difficulty not in ('Beginner', 'Intermediate', 'Expert') then
    raise exception 'Invalid difficulty';
  end if;

  if p_subgoal_id is not null then
    if not exists (select 1 from public.subgoals s where s.id = p_subgoal_id) then
      raise exception 'Invalid subgoal_id';
    end if;
  end if;

  select coalesce(max(c.position), 0) + 1
  into next_position
  from public.competencies c;

  insert into public.competencies (name, difficulty, tags, position, subgoal_id)
  values (
    btrim(p_name),
    p_difficulty,
    coalesce(p_tags, '{}'::uuid[]),
    next_position,
    p_subgoal_id
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- Update merge_competencies_from_stage to carry subgoal_id from stage to live.
-- Dormant today (no live caller), but updated for correctness so when it is wired up
-- the hierarchy flows through proposals.
create or replace function public.merge_competencies_from_stage(p_stage_table text default 'competencies_stage'::text)
returns table(updated_count integer, inserted_count integer)
language plpgsql
as $_$
declare
  sql text;
begin
  perform 1
  from information_schema.tables
  where table_schema = 'public' and table_name = p_stage_table;
  if not found then
    raise exception 'Staging table %.% does not exist', 'public', p_stage_table;
  end if;

  sql := format('update public.%I set name = btrim(name), difficulty = btrim(difficulty);', p_stage_table);
  execute sql;

  sql := format($f$
    with upd as (
      update public.competencies c
         set difficulty = s.difficulty,
             tags       = s.tags,
             subgoal_id = coalesce(s.subgoal_id, c.subgoal_id)
        from public.%1$I s
       where lower(c.name) = lower(s.name)
      returning 1
    ),
    ins as (
      insert into public.competencies (name, difficulty, tags, subgoal_id)
      select s.name, s.difficulty, s.tags, s.subgoal_id
        from public.%1$I s
        left join public.competencies c
               on lower(c.name) = lower(s.name)
       where c.id is null
      returning 1
    )
    select (select count(*) from upd)::int as updated_count,
           (select count(*) from ins)::int as inserted_count
  $f$, p_stage_table);

  execute sql into updated_count, inserted_count;

  return;
end;
$_$;

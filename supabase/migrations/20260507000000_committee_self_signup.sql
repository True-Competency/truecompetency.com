-- Replace the trigger function to populate ALL metadata fields on INSERT.
-- Previously only handled role, email, committee_role, full_name; now also handles
-- first_name, last_name, country_code, country_name, university, hospital.
-- Both /signup and /welcome benefit; client-side ensureProfile becomes mostly a no-op.
create or replace function public.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  resolved_role text;
  resolved_committee_role text;
  resolved_country_code text;
begin
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  resolved_role := coalesce(meta->>'role', 'trainee');
  resolved_committee_role := meta->>'committee_role';

  -- Country code must satisfy CHECK (country_code ~ '^[A-Z]{2}$') or default to 'ZZ'.
  resolved_country_code := upper(coalesce(nullif(meta->>'country_code', ''), 'ZZ'));

  insert into public.profiles (
    id, email, role, committee_role,
    first_name, last_name, full_name,
    country_code, country_name,
    university, hospital
  )
  values (
    new.id,
    new.email,
    resolved_role::user_role,
    resolved_committee_role,
    meta->>'first_name',
    meta->>'last_name',
    meta->>'full_name',
    resolved_country_code,
    meta->>'country_name',
    meta->>'university',
    meta->>'hospital'
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email),
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        first_name = coalesce(public.profiles.first_name, excluded.first_name),
        last_name = coalesce(public.profiles.last_name, excluded.last_name),
        country_code = case
          when public.profiles.country_code is null or public.profiles.country_code = 'ZZ'
          then excluded.country_code
          else public.profiles.country_code
        end,
        country_name = coalesce(public.profiles.country_name, excluded.country_name),
        university = coalesce(public.profiles.university, excluded.university),
        hospital = coalesce(public.profiles.hospital, excluded.hospital),
        committee_role = coalesce(public.profiles.committee_role, excluded.committee_role);

  return new;
end;
$$;

-- Drop the obsolete RPC. Old invitation flow no longer exists.
drop function if exists public.complete_committee_invitation(text, text, text, text, text, text);

-- Batch RPC for reassigning competencies to subgoals during the reorder flow.
-- Single call, parallel arrays, atomic at the DB level. Used by the committee
-- reorder modal to apply all cross-subgoal moves before chair_reorder_competencies
-- writes the new positions.

create or replace function public.chair_reassign_competency_subgoals(
  p_ids uuid[],
  p_subgoal_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  caller uuid := auth.uid();
  is_chair boolean;
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;

  select exists (
    select 1 from public.profiles
    where id = caller
      and role = 'committee'::public.user_role
      and committee_role = 'chief_editor'
  ) into is_chair;

  if not is_chair then
    raise exception 'Only committee chair can reassign subgoals';
  end if;

  if array_length(p_ids, 1) is distinct from array_length(p_subgoal_ids, 1) then
    raise exception 'p_ids and p_subgoal_ids length mismatch';
  end if;

  -- Validate every non-null subgoal_id exists.
  if exists (
    select 1 from unnest(p_subgoal_ids) as sg(id)
    where sg.id is not null
      and not exists (select 1 from public.subgoals where id = sg.id)
  ) then
    raise exception 'Invalid subgoal_id in input';
  end if;

  -- Validate every competency id exists. Guards against stale client state
  -- where a deleted competency's id might still be in the modal's draft.
  if exists (
    select 1 from unnest(p_ids) as cid(id)
    where not exists (select 1 from public.competencies where id = cid.id)
  ) then
    raise exception 'Invalid competency id in input';
  end if;

  -- Reject duplicate competency ids. UPDATE behavior with duplicate join keys
  -- is undefined; better to fail loudly than apply a non-deterministic result.
  if (select count(*) from unnest(p_ids)) != (select count(distinct id) from unnest(p_ids) as t(id)) then
    raise exception 'Duplicate competency ids in input';
  end if;

  update public.competencies c
  set subgoal_id = u.new_subgoal_id
  from (
    select unnest(p_ids) as id, unnest(p_subgoal_ids) as new_subgoal_id
  ) u
  where c.id = u.id;
end;
$$;

revoke all on function public.chair_reassign_competency_subgoals(uuid[], uuid[]) from public, anon;
grant execute on function public.chair_reassign_competency_subgoals(uuid[], uuid[]) to authenticated;
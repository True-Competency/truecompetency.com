-- Chair-only reorder of competencies without granting broad UPDATE on table.
-- This function is SECURITY DEFINER so frontend can call it under RLS safely.

CREATE OR REPLACE FUNCTION public.chair_reorder_competencies(p_ordered_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  is_chair boolean := false;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = caller_id
      AND p.role = 'committee'
      AND p.committee_role = 'chief_editor'
  ) INTO is_chair;

  IF NOT is_chair THEN
    RAISE EXCEPTION 'Only committee chair can reorder competencies';
  END IF;

  IF p_ordered_ids IS NULL OR array_length(p_ordered_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Ordered competency id list is required';
  END IF;

  UPDATE public.competencies c
  SET position = x.pos
  FROM (
    SELECT id, ord::int AS pos
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, ord)
  ) AS x
  WHERE c.id = x.id;
END;
$$;

REVOKE ALL ON FUNCTION public.chair_reorder_competencies(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chair_reorder_competencies(uuid[]) TO authenticated;


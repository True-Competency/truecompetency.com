-- Chair-only tag management helpers.
-- Keep tag arrays in competencies and competencies_stage consistent on delete.

CREATE OR REPLACE FUNCTION public.chair_rename_tag(p_tag_id uuid, p_new_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  clean_name text := trim(both from regexp_replace(coalesce(p_new_name, ''), '^#+', ''));
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
    RAISE EXCEPTION 'Only committee chair can rename tags';
  END IF;

  IF p_tag_id IS NULL THEN
    RAISE EXCEPTION 'Tag id is required';
  END IF;

  IF clean_name = '' THEN
    RAISE EXCEPTION 'Tag name is required';
  END IF;

  UPDATE public.tags
  SET name = clean_name
  WHERE id = p_tag_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tag not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.chair_delete_tag(p_tag_id uuid)
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
    RAISE EXCEPTION 'Only committee chair can delete tags';
  END IF;

  IF p_tag_id IS NULL THEN
    RAISE EXCEPTION 'Tag id is required';
  END IF;

  -- Remove references from array columns first.
  UPDATE public.competencies
  SET tags = array_remove(tags, p_tag_id)
  WHERE p_tag_id = ANY(tags);

  UPDATE public.competencies_stage
  SET tags = array_remove(tags, p_tag_id)
  WHERE p_tag_id = ANY(tags);

  DELETE FROM public.tags
  WHERE id = p_tag_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tag not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.chair_rename_tag(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chair_delete_tag(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chair_rename_tag(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chair_delete_tag(uuid) TO authenticated;

-- ============================================

CREATE OR REPLACE FUNCTION public.chair_create_tag(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  is_chair boolean := false;
  clean_name text := trim(both from regexp_replace(coalesce(p_name, ''), '^#+', ''));
  new_id uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = caller_id
      AND p.role = 'committee'
      AND p.committee_role = 'chief_editor'
  ) INTO is_chair;

  IF NOT is_chair THEN
    RAISE EXCEPTION 'Only committee chair can create tags';
  END IF;

  IF clean_name = '' THEN
    RAISE EXCEPTION 'Tag name is required';
  END IF;

  INSERT INTO public.tags (name, created_by)
  VALUES (clean_name, caller_id)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.chair_create_tag(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chair_create_tag(text) TO authenticated;
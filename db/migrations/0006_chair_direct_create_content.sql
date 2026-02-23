-- Chair-only direct create functions for competencies and questions.
-- These bypass table RLS through SECURITY DEFINER, but enforce strict chair checks.

CREATE OR REPLACE FUNCTION public.chair_create_competency(
  p_name text,
  p_difficulty text,
  p_tags uuid[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller uuid := auth.uid();
  is_chair boolean := false;
  new_id uuid;
  next_position integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = caller
      AND p.role = 'committee'::public.user_role
      AND p.committee_role = 'chief_editor'
  ) INTO is_chair;

  IF NOT is_chair THEN
    RAISE EXCEPTION 'Only committee chair can add competencies';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Competency name is required';
  END IF;

  IF p_difficulty IS NULL OR p_difficulty NOT IN ('Beginner', 'Intermediate', 'Expert') THEN
    RAISE EXCEPTION 'Invalid difficulty';
  END IF;

  SELECT COALESCE(MAX(c.position), 0) + 1
  INTO next_position
  FROM public.competencies c;

  INSERT INTO public.competencies (name, difficulty, tags, position)
  VALUES (
    btrim(p_name),
    p_difficulty,
    COALESCE(p_tags, '{}'::uuid[]),
    next_position
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.chair_create_competency(text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chair_create_competency(text, text, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.chair_create_question(
  p_competency_id uuid,
  p_question_text text,
  p_options text[],
  p_correct_index integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller uuid := auth.uid();
  is_chair boolean := false;
  new_question_id uuid;
  i integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = caller
      AND p.role = 'committee'::public.user_role
      AND p.committee_role = 'chief_editor'
  ) INTO is_chair;

  IF NOT is_chair THEN
    RAISE EXCEPTION 'Only committee chair can add questions';
  END IF;

  IF p_competency_id IS NULL THEN
    RAISE EXCEPTION 'Competency is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.competencies c
    WHERE c.id = p_competency_id
  ) THEN
    RAISE EXCEPTION 'Competency not found';
  END IF;

  IF p_question_text IS NULL OR btrim(p_question_text) = '' THEN
    RAISE EXCEPTION 'Question text is required';
  END IF;

  IF array_length(p_options, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Exactly 4 options are required';
  END IF;

  IF p_correct_index < 1 OR p_correct_index > 4 THEN
    RAISE EXCEPTION 'Correct option index is out of range';
  END IF;

  FOR i IN 1..4 LOOP
    IF btrim(COALESCE(p_options[i], '')) = '' THEN
      RAISE EXCEPTION 'All options must be filled';
    END IF;
  END LOOP;

  INSERT INTO public.competency_questions (competency_id, body)
  VALUES (p_competency_id, btrim(p_question_text))
  RETURNING id INTO new_question_id;

  FOR i IN 1..4 LOOP
    INSERT INTO public.question_options (question_id, label, body, is_correct)
    VALUES (
      new_question_id,
      chr(ascii('A') + (i - 1)),
      btrim(p_options[i]),
      i = p_correct_index
    );
  END LOOP;

  RETURN new_question_id;
END;
$$;

REVOKE ALL ON FUNCTION public.chair_create_question(uuid, text, text[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chair_create_question(uuid, text, text[], integer) TO authenticated;

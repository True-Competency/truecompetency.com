-- Simplify chair_create_question to match the actual schema exactly.
-- question_options columns used: question_id, body, is_correct, sort_order
-- competency_questions columns used: competency_id, body

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
    INSERT INTO public.question_options (question_id, body, is_correct, sort_order)
    VALUES (
      new_question_id,
      btrim(p_options[i]),
      i = p_correct_index,
      i - 1
    );
  END LOOP;

  RETURN new_question_id;
END;
$$;

REVOKE ALL ON FUNCTION public.chair_create_question(uuid, text, text[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chair_create_question(uuid, text, text[], integer) TO authenticated;

--
-- PostgreSQL database dump
--

\restrict L2bdb98IfwX03OjNomCMtndSFPAgtGuEHKnrEh30ZQp4RyH4LKGrICWTowOYVpL

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'trainee',
    'instructor',
    'committee',
    'admin'
);


--
-- Name: _make_full_name(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._make_full_name(p_first text, p_last text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select nullif(trim(coalesce(p_first,'') || ' ' || coalesce(p_last,'')), '');
$$;


--
-- Name: auth_is_instructor(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_is_instructor(uid uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'instructor'::user_role
  );
$$;


--
-- Name: committee_propose_question(uuid, text, text[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.committee_propose_question(p_competency_id uuid, p_question_text text, p_options text[], p_correct_index integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller uuid := auth.uid();
  new_id uuid;
  i int;
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;

  -- Allow committee OR app admin
  if not (
    public.is_app_admin(caller)
    or exists (
      select 1
      from public.profiles p
      where p.id = caller
        and p.role = 'committee'::user_role
    )
  ) then
    raise exception 'not authorized';
  end if;

  if p_competency_id is null then
    raise exception 'competency required';
  end if;

  if p_question_text is null or btrim(p_question_text) = '' then
    raise exception 'question text required';
  end if;

  if array_length(p_options, 1) is distinct from 4 then
    raise exception 'must provide exactly 4 options';
  end if;

  if p_correct_index < 1 or p_correct_index > 4 then
    raise exception 'correct index out of range';
  end if;

  insert into public.competency_questions_stage (competency_id, question_text, suggested_by)
  values (p_competency_id, btrim(p_question_text), caller)
  returning id into new_id;

  for i in 1..4 loop
    insert into public.competency_question_options_stage (
      stage_question_id,
      option_text,
      is_correct,
      sort_order
    )
    values (
      new_id,
      btrim(p_options[i]),
      (i = p_correct_index),
      i - 1
    );
  end loop;

  return new_id;
end;
$$;


--
-- Name: committee_submit_question_proposal(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.committee_submit_question_proposal(p_competency_id uuid, p_question_text text, p_options jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller uuid := auth.uid();
  v_stage_qid uuid;
  v_len int;
  v_correct int;
begin
  -- Only committee members or app admins may propose
  if not (
    public.is_app_admin(caller) OR
    exists (select 1 from public.profiles p where p.id = caller AND p.role = 'committee')
  ) then
    raise exception 'not authorized';
  end if;

  if p_competency_id is null then
    raise exception 'missing competency_id';
  end if;

  if p_question_text is null or btrim(p_question_text) = '' then
    raise exception 'missing question';
  end if;

  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception 'options must be a json array';
  end if;

  v_len := jsonb_array_length(p_options);
  if v_len < 2 then
    raise exception 'at least two options required';
  end if;

  select count(*) into v_correct
  from jsonb_array_elements(p_options) as e
  where coalesce((e->>'is_correct')::boolean, false) = true;

  if v_correct <> 1 then
    raise exception 'exactly one correct option required';
  end if;

  insert into public.competency_questions_stage (competency_id, question_text, suggested_by)
  values (p_competency_id, btrim(p_question_text), caller)
  returning id into v_stage_qid;

  insert into public.competency_question_options_stage (
    stage_question_id,
    option_text,
    is_correct,
    sort_order
  )
  select
    v_stage_qid,
    btrim(coalesce(e->>'option_text','')),
    coalesce((e->>'is_correct')::boolean, false),
    coalesce((e->>'sort_order')::int, ord - 1)
  from jsonb_array_elements(p_options) with ordinality as t(e, ord)
  where btrim(coalesce(e->>'option_text','')) <> '';

  -- Re-check after empty filtering
  select count(*) into v_len
  from public.competency_question_options_stage
  where stage_question_id = v_stage_qid;

  if v_len < 2 then
    raise exception 'fewer than two non-empty options';
  end if;

  select count(*) into v_correct
  from public.competency_question_options_stage
  where stage_question_id = v_stage_qid and is_correct = true;

  if v_correct <> 1 then
    raise exception 'exactly one correct option required';
  end if;

  return v_stage_qid;
end;
$$;


--
-- Name: committee_vote_on_question(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.committee_vote_on_question(p_stage_question_id uuid, p_vote boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller uuid := auth.uid();
  for_count int;
  total_count int;
  stage_row record;
  new_question_id uuid;
begin
  -- auth: committee or app admin
  if not (
    public.is_app_admin(caller)
    or exists (select 1 from public.profiles p where p.id = caller and p.role = 'committee')
  ) then
    raise exception 'not authorized';
  end if;

  -- serialize per question to prevent double-merges
  perform pg_advisory_xact_lock(hashtext(p_stage_question_id::text));

  -- upsert vote
  insert into public.committee_question_votes(stage_question_id, voter_id, vote)
  values (p_stage_question_id, caller, p_vote)
  on conflict (stage_question_id, voter_id)
  do update set vote = excluded.vote, updated_at = now();

  -- counts
  select
    count(*) filter (where vote = true),
    count(*)
  into for_count, total_count
  from public.committee_question_votes
  where stage_question_id = p_stage_question_id;

  -- threshold: at least 4 votes AND >= 50% for
  if total_count >= 4 and (for_count::numeric / total_count::numeric) >= 0.5 then
    -- load stage question (may already be merged/deleted)
    select *
    into stage_row
    from public.competency_questions_stage
    where id = p_stage_question_id;

    if not found then
      -- already merged or deleted; nothing to do
      return;
    end if;

    -- insert into canonical tables
    insert into public.competency_questions(competency_id, question_text)
    values (stage_row.competency_id, stage_row.question_text)
    returning id into new_question_id;

    insert into public.question_options(question_id, option_text, is_correct, sort_order)
    select
      new_question_id,
      o.option_text,
      o.is_correct,
      o.sort_order
    from public.competency_question_options_stage o
    where o.stage_question_id = p_stage_question_id
    order by o.sort_order asc;

    -- delete stage rows (cascades votes/options if FKs are set to cascade)
    delete from public.competency_questions_stage where id = p_stage_question_id;
  end if;
end;
$$;


--
-- Name: competencies_search_tsv(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.competencies_search_tsv() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  new.search :=
    to_tsvector(
      'english',
      unaccent(coalesce(new.name, '')) || ' ' ||
      unaccent(coalesce(array_to_string(new.index_terms, ' '), ''))
    );
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role public.user_role,
    created_at timestamp with time zone DEFAULT now(),
    first_name text,
    last_name text,
    committee_role text,
    country_code text DEFAULT 'ZZ'::text,
    university text,
    hospital text,
    country_name text,
    CONSTRAINT profiles_committee_role_check CHECK ((committee_role = ANY (ARRAY['editor'::text, 'chief_editor'::text]))),
    CONSTRAINT profiles_country_code_chk CHECK ((country_code ~ '^[A-Z]{2}$'::text)),
    CONSTRAINT profiles_country_code_len CHECK (((country_code IS NULL) OR ((length(country_code) >= 2) AND (length(country_code) <= 3))))
);


--
-- Name: TABLE profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profiles IS 'List of all registered users';


--
-- Name: COLUMN profiles.country_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.country_code IS 'ISO-3166-1 alpha-2 country code (UPPERCASE, e.g., US, CA). Required.';


--
-- Name: COLUMN profiles.university; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.university IS 'Optional. Trainees can provide their university.';


--
-- Name: COLUMN profiles.hospital; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.hospital IS 'Optional. Instructors can provide their hospital.';


--
-- Name: ensure_profile_rpc(text, public.user_role, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_profile_rpc(p_email text DEFAULT NULL::text, p_role public.user_role DEFAULT 'trainee'::public.user_role, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text) RETURNS public.profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_full text;
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'No auth.uid() in context';
  end if;

  v_full := public._make_full_name(p_first_name, p_last_name);

  -- Upsert by PK (id). This is atomic; no duplicate PK race.
  insert into public.profiles as p (id, email, full_name, role, first_name, last_name)
  values (v_uid, p_email, v_full, p_role, p_first_name, p_last_name)
  on conflict (id) do update
  set
    -- don’t clobber existing fields with nulls
    email      = coalesce(excluded.email, p.email),
    first_name = coalesce(excluded.first_name, p.first_name),
    last_name  = coalesce(excluded.last_name,  p.last_name),
    full_name  = coalesce(excluded.full_name,  p.full_name),
    -- keep existing role unless it’s null
    role       = coalesce(p.role, excluded.role)
  returning * into v_row;

  return v_row;
end;
$$;


--
-- Name: fn_profiles_country_uc(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_profiles_country_uc() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.country_code IS NOT NULL THEN
    NEW.country_code := UPPER(TRIM(NEW.country_code));
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: instructor_mark_competency_complete(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.instructor_mark_competency_complete(p_student_id uuid, p_competency_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller uuid := auth.uid();
begin
  -- Only instructors or admins may approve
  if not (
    public.is_app_admin(caller) OR
    exists (select 1 from public.profiles p where p.id = caller AND p.role = 'instructor')
  ) then
    raise exception 'not authorized';
  end if;

  insert into public.student_competency_overrides (student_id, competency_id, pct, approved_by)
  values (p_student_id, p_competency_id, 100, caller)
  on conflict (student_id, competency_id)
  do update set pct = 100, approved_by = caller, approved_at = now();
end;
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(p_uid uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id = p_uid);
$$;


--
-- Name: is_app_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_app_admin(uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.app_admins a
    where a.user_id = uid
  );
$$;


--
-- Name: merge_competencies_from_stage(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_competencies_from_stage(p_stage_table text DEFAULT 'competencies_stage'::text) RETURNS TABLE(updated_count integer, inserted_count integer)
    LANGUAGE plpgsql
    AS $_$
declare
  sql text;
begin
  -- 0) Ensure staging table exists
  perform 1
  from information_schema.tables
  where table_schema = 'public' and table_name = p_stage_table;
  if not found then
    raise exception 'Staging table %.% does not exist', 'public', p_stage_table;
  end if;

  -- 1) Normalize whitespace in staging (safe no-op if already clean)
  sql := format('update public.%I set name = btrim(name), difficulty = btrim(difficulty);', p_stage_table);
  execute sql;

  -- 2) Do the merge and return counts (ALL dynamic parts inside one EXECUTE)
  sql := format($f$
    with upd as (
      update public.competencies c
         set difficulty = s.difficulty,
             tags        = s.tags
        from public.%1$I s
       where lower(c.name) = lower(s.name)
      returning 1
    ),
    ins as (
      insert into public.competencies (name, difficulty, tags)
      select s.name, s.difficulty, s.tags
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


--
-- Name: prevent_role_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_role_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- allow if previously NULL, or no change
    IF OLD.role IS NULL OR OLD.role = NEW.role THEN
      RETURN NEW;
    END IF;

    -- block non-admin changes
    IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can change role';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: prevent_role_change_unless_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_role_change_unless_admin() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can change role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: regrade_answer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.regrade_answer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  correct_id uuid;
begin
  if NEW.selected_option_id is not null then
    select id into correct_id
    from public.question_options
    where question_id = NEW.question_id and is_correct = true;

    if correct_id is null then
      NEW.is_correct := null;
    else
      NEW.is_correct := (NEW.selected_option_id = correct_id);
    end if;

    NEW.answer_text := null;  -- MCQ: no free text
  else
    -- Free-text answer path, if you add those later
    NEW.is_correct := null;
  end if;

  NEW.answered_at := coalesce(NEW.answered_at, now());
  return NEW;
end;
$$;


--
-- Name: set_admin_role_on_profiles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_admin_role_on_profiles() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id = NEW.id) THEN
    NEW.role := 'admin'::user_role;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_is_correct(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_is_correct() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.selected_option_id IS NOT NULL THEN
    SELECT is_correct INTO NEW.is_correct
    FROM question_options WHERE id = NEW.selected_option_id;
  ELSE
    NEW.is_correct := NULL;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


--
-- Name: set_user_admin(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_admin(p_user_id uuid, p_is_admin boolean) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  update public.profiles
     set is_admin = coalesce(p_is_admin, false)
   where id = p_user_id;
$$;


--
-- Name: set_user_role(uuid, public.user_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_role(p_user_id uuid, p_role public.user_role) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  update public.profiles
     set role = p_role
   where id = p_user_id;
$$;


--
-- Name: sync_country_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_country_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.country_name := (
    SELECT name
    FROM countries
    WHERE code = NEW.country_code
  );
  RETURN NEW;
END;
$$;


--
-- Name: sync_profile_from_auth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_profile_from_auth() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  update public.profiles
     set email = coalesce(new.email, email),
         full_name = coalesce((new.raw_user_meta_data->>'full_name'), full_name)
   where id = new.id;
  return new;
end;
$$;


--
-- Name: app_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_admins (
    user_id uuid NOT NULL
);


--
-- Name: TABLE app_admins; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_admins IS 'Admin accounts for the website';


--
-- Name: committee_question_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.committee_question_votes (
    stage_question_id uuid NOT NULL,
    voter_id uuid NOT NULL,
    vote boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE committee_question_votes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.committee_question_votes IS 'Committee votes on proposed questions';


--
-- Name: committee_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.committee_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    voter_id uuid NOT NULL,
    vote boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE committee_votes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.committee_votes IS 'Committee votes on proposed competencies';


--
-- Name: competencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    difficulty text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    test_question text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ic_competency_difficulty_check CHECK ((difficulty = ANY (ARRAY['Beginner'::text, 'Intermediate'::text, 'Advanced'::text, 'Expert'::text])))
);


--
-- Name: TABLE competencies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.competencies IS 'List of all active competencies';


--
-- Name: competencies_stage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competencies_stage (
    name text NOT NULL,
    difficulty text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    justification text,
    suggested_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE competencies_stage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.competencies_stage IS 'List of all proposed (not yet active) competencies';


--
-- Name: competency_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competency_assignments (
    student_id uuid NOT NULL,
    competency_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by uuid
);


--
-- Name: TABLE competency_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.competency_assignments IS 'Competencies to students mapping';


--
-- Name: competency_question_options_stage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competency_question_options_stage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_question_id uuid NOT NULL,
    option_text text NOT NULL,
    is_correct boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE competency_question_options_stage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.competency_question_options_stage IS 'Table of proposed MCQ options';


--
-- Name: competency_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competency_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    competency_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE competency_questions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.competency_questions IS 'List of all test questions of active competencies';


--
-- Name: competency_questions_stage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competency_questions_stage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    competency_id uuid NOT NULL,
    question_text text NOT NULL,
    suggested_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE competency_questions_stage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.competency_questions_stage IS 'List of all proposed (not yet active) questions';


--
-- Name: countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.countries (
    code character(2) NOT NULL,
    name text NOT NULL
);


--
-- Name: TABLE countries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.countries IS 'List of all countries with their codes';


--
-- Name: question_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    body text NOT NULL,
    is_correct boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer NOT NULL
);


--
-- Name: TABLE question_options; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.question_options IS 'List of all active MCQ''s options';


--
-- Name: student_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_answers (
    student_id uuid NOT NULL,
    question_id uuid NOT NULL,
    is_correct boolean NOT NULL,
    answered_at timestamp with time zone DEFAULT now() NOT NULL,
    selected_option_id uuid NOT NULL,
    answer_text text,
    CONSTRAINT student_answers_consistency_chk CHECK ((((selected_option_id IS NOT NULL) AND (answer_text IS NULL)) OR ((selected_option_id IS NULL) AND (answer_text IS NOT NULL))))
);


--
-- Name: TABLE student_answers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.student_answers IS 'List of all recorded trainee answers';


--
-- Name: student_competency_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_competency_overrides (
    student_id uuid NOT NULL,
    competency_id uuid NOT NULL,
    pct integer NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT student_competency_overrides_pct_check CHECK (((pct >= 0) AND (pct <= 100)))
);


--
-- Name: TABLE student_competency_overrides; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.student_competency_overrides IS 'Mapping of completed competencies to students';


--
-- Name: student_competency_progress; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.student_competency_progress AS
 WITH base AS (
         SELECT ca.student_id,
            ca.competency_id,
            COALESCE(q.total_questions, 0) AS total_questions,
            COALESCE(a.correct_answers, 0) AS answered_questions,
                CASE
                    WHEN (COALESCE(q.total_questions, 0) = 0) THEN 0
                    ELSE (round(((100.0 * (COALESCE(a.correct_answers, 0))::numeric) / (NULLIF(q.total_questions, 0))::numeric)))::integer
                END AS pct_answers
           FROM ((public.competency_assignments ca
             LEFT JOIN ( SELECT competency_questions.competency_id,
                    (count(*))::integer AS total_questions
                   FROM public.competency_questions
                  GROUP BY competency_questions.competency_id) q USING (competency_id))
             LEFT JOIN ( SELECT sa.student_id,
                    cq.competency_id,
                    (count(DISTINCT
                        CASE
                            WHEN (sa.is_correct IS TRUE) THEN sa.question_id
                            ELSE NULL::uuid
                        END))::integer AS correct_answers
                   FROM (public.student_answers sa
                     JOIN public.competency_questions cq ON ((cq.id = sa.question_id)))
                  GROUP BY sa.student_id, cq.competency_id) a ON (((a.student_id = ca.student_id) AND (a.competency_id = ca.competency_id))))
        ), overr AS (
         SELECT student_competency_overrides.student_id,
            student_competency_overrides.competency_id,
            student_competency_overrides.pct
           FROM public.student_competency_overrides
        )
 SELECT b.student_id,
    b.competency_id,
    b.total_questions,
    b.answered_questions,
    COALESCE(o.pct, b.pct_answers) AS pct
   FROM (base b
     LEFT JOIN overr o ON (((o.student_id = b.student_id) AND (o.competency_id = b.competency_id))));


--
-- Name: student_overall_progress; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.student_overall_progress AS
 WITH base AS (
         SELECT scp.student_id,
            scp.competency_id,
            scp.total_questions,
            scp.answered_questions,
            scp.pct
           FROM public.student_competency_progress scp
        )
 SELECT student_id,
        CASE
            WHEN (sum(total_questions) FILTER (WHERE (total_questions > 0)) = 0) THEN 0
            ELSE (round(((100.0 * (sum(answered_questions))::numeric) / (NULLIF(sum(total_questions), 0))::numeric)))::integer
        END AS overall_pct_weighted,
        CASE
            WHEN (count(*) = 0) THEN 0
            ELSE (round(avg(pct)))::integer
        END AS overall_pct_simple,
    (count(*))::integer AS competencies_assigned,
    (count(*) FILTER (WHERE (total_questions > 0)))::integer AS competencies_with_questions,
    (sum(total_questions))::integer AS total_questions,
    (sum(answered_questions))::integer AS total_answered
   FROM base b
  GROUP BY student_id;


--
-- Name: student_overall_progress_mv; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.student_overall_progress_mv AS
 SELECT student_id,
    overall_pct_weighted,
    overall_pct_simple,
    competencies_assigned,
    competencies_with_questions,
    total_questions,
    total_answered
   FROM public.student_overall_progress
  WITH NO DATA;


--
-- Name: app_admins app_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_admins
    ADD CONSTRAINT app_admins_pkey PRIMARY KEY (user_id);


--
-- Name: committee_question_votes committee_question_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.committee_question_votes
    ADD CONSTRAINT committee_question_votes_pkey PRIMARY KEY (stage_question_id, voter_id);


--
-- Name: committee_votes committee_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.committee_votes
    ADD CONSTRAINT committee_votes_pkey PRIMARY KEY (id);


--
-- Name: committee_votes committee_votes_stage_id_voter_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.committee_votes
    ADD CONSTRAINT committee_votes_stage_id_voter_id_key UNIQUE (stage_id, voter_id);


--
-- Name: committee_votes committee_votes_unique_voter_per_stage; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.committee_votes
    ADD CONSTRAINT committee_votes_unique_voter_per_stage UNIQUE (stage_id, voter_id);


--
-- Name: competencies_stage competencies_stage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competencies_stage
    ADD CONSTRAINT competencies_stage_pkey PRIMARY KEY (id);


--
-- Name: competency_assignments competency_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_assignments
    ADD CONSTRAINT competency_assignments_pkey PRIMARY KEY (student_id, competency_id);


--
-- Name: competency_assignments competency_assignments_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_assignments
    ADD CONSTRAINT competency_assignments_unique UNIQUE (student_id, competency_id);


--
-- Name: competency_question_options_stage competency_question_options_stage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_question_options_stage
    ADD CONSTRAINT competency_question_options_stage_pkey PRIMARY KEY (id);


--
-- Name: competency_questions competency_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_questions
    ADD CONSTRAINT competency_questions_pkey PRIMARY KEY (id);


--
-- Name: competency_questions_stage competency_questions_stage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_questions_stage
    ADD CONSTRAINT competency_questions_stage_pkey PRIMARY KEY (id);


--
-- Name: countries countries_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_name_key UNIQUE (name);


--
-- Name: countries countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (code);


--
-- Name: competencies ic_competency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competencies
    ADD CONSTRAINT ic_competency_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: question_options question_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_options
    ADD CONSTRAINT question_options_pkey PRIMARY KEY (id);


--
-- Name: student_answers student_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_answers
    ADD CONSTRAINT student_answers_pkey PRIMARY KEY (student_id, question_id);


--
-- Name: student_answers student_answers_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_answers
    ADD CONSTRAINT student_answers_unique UNIQUE (student_id, question_id);


--
-- Name: student_competency_overrides student_competency_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_competency_overrides
    ADD CONSTRAINT student_competency_overrides_pkey PRIMARY KEY (student_id, competency_id);


--
-- Name: competencies_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX competencies_name_key ON public.competencies USING btree (name);


--
-- Name: idx_ans_q; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ans_q ON public.student_answers USING btree (question_id);


--
-- Name: idx_ans_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ans_student ON public.student_answers USING btree (student_id);


--
-- Name: idx_answers_question; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_answers_question ON public.student_answers USING btree (question_id);


--
-- Name: idx_answers_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_answers_student ON public.student_answers USING btree (student_id);


--
-- Name: idx_ca_comp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_comp ON public.competency_assignments USING btree (competency_id);


--
-- Name: idx_ca_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ca_student ON public.competency_assignments USING btree (student_id);


--
-- Name: idx_comp_assign_comp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comp_assign_comp ON public.competency_assignments USING btree (competency_id);


--
-- Name: idx_comp_assign_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comp_assign_student ON public.competency_assignments USING btree (student_id);


--
-- Name: idx_competencies_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_competencies_name_unique ON public.competencies USING btree (lower(name));


--
-- Name: idx_competencies_stage_lower_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competencies_stage_lower_name ON public.competencies_stage USING btree (lower(name));


--
-- Name: idx_competencies_tags_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competencies_tags_gin ON public.competencies USING gin (tags);


--
-- Name: idx_competency_assignments_competency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competency_assignments_competency ON public.competency_assignments USING btree (competency_id);


--
-- Name: idx_competency_assignments_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competency_assignments_student ON public.competency_assignments USING btree (student_id);


--
-- Name: idx_cqos_stage_qid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cqos_stage_qid ON public.competency_question_options_stage USING btree (stage_question_id);


--
-- Name: idx_cqs_competency_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cqs_competency_id ON public.competency_questions_stage USING btree (competency_id);


--
-- Name: idx_cqs_suggested_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cqs_suggested_by ON public.competency_questions_stage USING btree (suggested_by);


--
-- Name: idx_cqv_stage_question_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cqv_stage_question_id ON public.committee_question_votes USING btree (stage_question_id);


--
-- Name: idx_cqv_voter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cqv_voter_id ON public.committee_question_votes USING btree (voter_id);


--
-- Name: idx_opts_q; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opts_q ON public.question_options USING btree (question_id);


--
-- Name: idx_profiles_country_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_country_code ON public.profiles USING btree (country_code);


--
-- Name: idx_profiles_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_email_lower ON public.profiles USING btree (lower(email));


--
-- Name: idx_profiles_hospital_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_hospital_ci ON public.profiles USING btree (lower(hospital));


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_profiles_university_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_university_ci ON public.profiles USING btree (lower(university));


--
-- Name: idx_qs_comp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qs_comp ON public.competency_questions USING btree (competency_id);


--
-- Name: idx_questions_comp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questions_comp ON public.competency_questions USING btree (competency_id);


--
-- Name: uq_comp_stage_name_difficulty; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_comp_stage_name_difficulty ON public.competencies_stage USING btree (lower(name), difficulty);


--
-- Name: uq_question_options_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_question_options_sort ON public.question_options USING btree (question_id, sort_order);


--
-- Name: uq_question_single_correct; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_question_single_correct ON public.question_options USING btree (question_id) WHERE is_correct;


--
-- Name: uq_votes_stage_voter; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_votes_stage_voter ON public.committee_votes USING btree (stage_id, voter_id);


--
-- Name: ux_competencies_lower_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_competencies_lower_name ON public.competencies USING btree (lower(name));


--
-- Name: ux_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_profiles_email ON public.profiles USING btree (lower(email));


--
-- Name: ux_sop_mv_student; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_sop_mv_student ON public.student_overall_progress_mv USING btree (student_id);


--
-- Name: competency_questions_stage trg_cqs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cqs_updated_at BEFORE UPDATE ON public.competency_questions_stage FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles trg_prevent_role_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_role_change BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_role_change();


--
-- Name: profiles trg_profiles_admin_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_admin_role BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_admin_role_on_profiles();


--
-- Name: profiles trg_profiles_country_uc; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_country_uc BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.fn_profiles_country_uc();


--
-- Name: profiles trg_profiles_no_role_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_no_role_change BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_role_change_unless_admin();


--
-- Name: student_answers trg_regrade_answer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_regrade_answer BEFORE INSERT OR UPDATE ON public.student_answers FOR EACH ROW EXECUTE FUNCTION public.regrade_answer();


--
-- Name: student_answers trg_set_is_correct; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_is_correct BEFORE INSERT OR UPDATE OF selected_option_id ON public.student_answers FOR EACH ROW EXECUTE FUNCTION public.set_is_correct();


--
-- Name: profiles trg_sync_country; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_country BEFORE INSERT OR UPDATE OF country_code ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_country_name();


--
-- Name: app_admins app_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_admins
    ADD CONSTRAINT app_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: committee_question_votes committee_question_votes_stage_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.committee_question_votes
    ADD CONSTRAINT committee_question_votes_stage_question_id_fkey FOREIGN KEY (stage_question_id) REFERENCES public.competency_questions_stage(id) ON DELETE CASCADE;


--
-- Name: committee_question_votes committee_question_votes_voter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.committee_question_votes
    ADD CONSTRAINT committee_question_votes_voter_id_fkey FOREIGN KEY (voter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: committee_votes committee_votes_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.committee_votes
    ADD CONSTRAINT committee_votes_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.competencies_stage(id) ON DELETE CASCADE;


--
-- Name: committee_votes committee_votes_voter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.committee_votes
    ADD CONSTRAINT committee_votes_voter_id_fkey FOREIGN KEY (voter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: competencies_stage competencies_stage_suggested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competencies_stage
    ADD CONSTRAINT competencies_stage_suggested_by_fkey FOREIGN KEY (suggested_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: competency_assignments competency_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_assignments
    ADD CONSTRAINT competency_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id);


--
-- Name: competency_assignments competency_assignments_competency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_assignments
    ADD CONSTRAINT competency_assignments_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competencies(id) ON DELETE CASCADE;


--
-- Name: competency_assignments competency_assignments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_assignments
    ADD CONSTRAINT competency_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: competency_question_options_stage competency_question_options_stage_stage_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_question_options_stage
    ADD CONSTRAINT competency_question_options_stage_stage_question_id_fkey FOREIGN KEY (stage_question_id) REFERENCES public.competency_questions_stage(id) ON DELETE CASCADE;


--
-- Name: competency_questions competency_questions_competency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_questions
    ADD CONSTRAINT competency_questions_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competencies(id) ON DELETE CASCADE;


--
-- Name: competency_questions_stage competency_questions_stage_competency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_questions_stage
    ADD CONSTRAINT competency_questions_stage_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competencies(id) ON DELETE CASCADE;


--
-- Name: competency_questions_stage competency_questions_stage_suggested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_questions_stage
    ADD CONSTRAINT competency_questions_stage_suggested_by_fkey FOREIGN KEY (suggested_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_country_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_country_code_fkey FOREIGN KEY (country_code) REFERENCES public.countries(code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: question_options question_options_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_options
    ADD CONSTRAINT question_options_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.competency_questions(id) ON DELETE CASCADE;


--
-- Name: student_answers student_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_answers
    ADD CONSTRAINT student_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.competency_questions(id) ON DELETE CASCADE;


--
-- Name: student_answers student_answers_selected_option_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_answers
    ADD CONSTRAINT student_answers_selected_option_fk FOREIGN KEY (selected_option_id) REFERENCES public.question_options(id) ON DELETE SET NULL;


--
-- Name: student_answers student_answers_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_answers
    ADD CONSTRAINT student_answers_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: student_competency_overrides student_competency_overrides_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_competency_overrides
    ADD CONSTRAINT student_competency_overrides_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: student_competency_overrides student_competency_overrides_competency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_competency_overrides
    ADD CONSTRAINT student_competency_overrides_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competencies(id) ON DELETE CASCADE;


--
-- Name: student_competency_overrides student_competency_overrides_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_competency_overrides
    ADD CONSTRAINT student_competency_overrides_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: competencies Allow read for all authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read for all authenticated users" ON public.competencies FOR SELECT TO authenticated USING (true);


--
-- Name: student_answers admin all - answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin all - answers" ON public.student_answers USING ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: competency_assignments admin all - comp_assign; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin all - comp_assign" ON public.competency_assignments USING ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: competencies admin all - competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin all - competencies" ON public.competencies USING ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: question_options admin all - options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin all - options" ON public.question_options USING ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: competency_questions admin all - questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin all - questions" ON public.competency_questions USING ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: competency_assignments admin full access - ca delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin full access - ca delete" ON public.competency_assignments FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: competency_assignments admin full access - ca insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin full access - ca insert" ON public.competency_assignments FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: competency_assignments admin full access - ca select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin full access - ca select" ON public.competency_assignments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: competency_assignments admin full access - ca update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin full access - ca update" ON public.competency_assignments FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: student_answers admin full access - student_answers all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin full access - student_answers all" ON public.student_answers USING ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.app_admins a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: app_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: competency_assignments ca_instructor_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_instructor_insert ON public.competency_assignments FOR INSERT TO authenticated WITH CHECK ((public.is_app_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles me
  WHERE ((me.id = auth.uid()) AND (me.role = 'instructor'::public.user_role))))));


--
-- Name: competency_assignments ca_instructor_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_instructor_read_all ON public.competency_assignments FOR SELECT TO authenticated USING ((public.is_app_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles me
  WHERE ((me.id = auth.uid()) AND (me.role = 'instructor'::public.user_role))))));


--
-- Name: competency_assignments ca_instructor_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_instructor_update ON public.competency_assignments FOR UPDATE TO authenticated USING ((public.is_app_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles me
  WHERE ((me.id = auth.uid()) AND (me.role = 'instructor'::public.user_role)))))) WITH CHECK ((public.is_app_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles me
  WHERE ((me.id = auth.uid()) AND (me.role = 'instructor'::public.user_role))))));


--
-- Name: competency_assignments ca_trainee_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_trainee_insert_own ON public.competency_assignments FOR INSERT TO authenticated WITH CHECK ((student_id = auth.uid()));


--
-- Name: competency_assignments ca_trainee_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_trainee_read_own ON public.competency_assignments FOR SELECT TO authenticated USING ((student_id = auth.uid()));


--
-- Name: competency_assignments ca_trainee_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ca_trainee_update_own ON public.competency_assignments FOR UPDATE TO authenticated USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: committee_question_votes committee can read question votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "committee can read question votes" ON public.committee_question_votes FOR SELECT USING ((public.is_app_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'committee'::public.user_role))))));


--
-- Name: competencies committee read competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "committee read competencies" ON public.competencies FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p2
  WHERE ((p2.id = auth.uid()) AND (p2.role = 'committee'::public.user_role)))));


--
-- Name: question_options committee read options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "committee read options" ON public.question_options FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p2
  WHERE ((p2.id = auth.uid()) AND (p2.role = 'committee'::public.user_role)))));


--
-- Name: competency_questions committee read questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "committee read questions" ON public.competency_questions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p2
  WHERE ((p2.id = auth.uid()) AND (p2.role = 'committee'::public.user_role)))));


--
-- Name: competency_question_options_stage committee_delete_own_staged_options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY committee_delete_own_staged_options ON public.competency_question_options_stage FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.competency_questions_stage q
  WHERE ((q.id = competency_question_options_stage.stage_question_id) AND (q.suggested_by = auth.uid())))));


--
-- Name: competency_questions_stage committee_delete_own_staged_questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY committee_delete_own_staged_questions ON public.competency_questions_stage FOR DELETE USING ((suggested_by = auth.uid()));


--
-- Name: competency_question_options_stage committee_insert_staged_options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY committee_insert_staged_options ON public.competency_question_options_stage FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.competency_questions_stage q
  WHERE ((q.id = competency_question_options_stage.stage_question_id) AND (q.suggested_by = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'committee'::public.user_role))))));


--
-- Name: competency_questions_stage committee_insert_staged_questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY committee_insert_staged_questions ON public.competency_questions_stage FOR INSERT WITH CHECK (((auth.uid() = suggested_by) AND (public.is_app_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'committee'::public.user_role)))))));


--
-- Name: committee_question_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.committee_question_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: competency_question_options_stage committee_read_staged_options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY committee_read_staged_options ON public.competency_question_options_stage FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'committee'::public.user_role)))));


--
-- Name: competency_question_options_stage committee_read_staged_question_options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY committee_read_staged_question_options ON public.competency_question_options_stage FOR SELECT USING ((public.is_app_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'committee'::public.user_role))))));


--
-- Name: competency_questions_stage committee_read_staged_questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY committee_read_staged_questions ON public.competency_questions_stage FOR SELECT USING ((public.is_app_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'committee'::public.user_role))))));


--
-- Name: competency_question_options_stage committee_update_own_staged_options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY committee_update_own_staged_options ON public.competency_question_options_stage FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.competency_questions_stage q
  WHERE ((q.id = competency_question_options_stage.stage_question_id) AND (q.suggested_by = auth.uid())))));


--
-- Name: competency_questions_stage committee_update_own_staged_questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY committee_update_own_staged_questions ON public.competency_questions_stage FOR UPDATE USING ((suggested_by = auth.uid())) WITH CHECK ((suggested_by = auth.uid()));


--
-- Name: committee_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.committee_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: committee_votes committee_votes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY committee_votes_select ON public.committee_votes FOR SELECT TO authenticated USING ((public.is_app_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'committee'::public.user_role))))));


--
-- Name: committee_votes committee_votes_upsert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY committee_votes_upsert ON public.committee_votes TO authenticated USING (((voter_id = auth.uid()) AND (public.is_app_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'committee'::public.user_role))))))) WITH CHECK (((voter_id = auth.uid()) AND (public.is_app_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'committee'::public.user_role)))))));


--
-- Name: competencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competencies ENABLE ROW LEVEL SECURITY;

--
-- Name: competencies_stage competencies_stage_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY competencies_stage_insert_own ON public.competencies_stage FOR INSERT TO authenticated WITH CHECK (((suggested_by IS NULL) OR (suggested_by = auth.uid())));


--
-- Name: competency_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competency_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: competency_question_options_stage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competency_question_options_stage ENABLE ROW LEVEL SECURITY;

--
-- Name: competency_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competency_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: competency_questions_stage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competency_questions_stage ENABLE ROW LEVEL SECURITY;

--
-- Name: competency_questions cq_instructor_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cq_instructor_read_all ON public.competency_questions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles me
  WHERE ((me.id = auth.uid()) AND (me.role = 'instructor'::public.user_role)))));


--
-- Name: competency_questions cq_trainee_read_enrolled; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cq_trainee_read_enrolled ON public.competency_questions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.competency_assignments ca
  WHERE ((ca.competency_id = competency_questions.competency_id) AND (ca.student_id = auth.uid())))));


--
-- Name: student_answers instructor read all answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "instructor read all answers" ON public.student_answers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p2
  WHERE ((p2.id = auth.uid()) AND (p2.role = 'instructor'::public.user_role)))));


--
-- Name: competency_assignments instructor read all assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "instructor read all assignments" ON public.competency_assignments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p2
  WHERE ((p2.id = auth.uid()) AND (p2.role = 'instructor'::public.user_role)))));


--
-- Name: committee_question_votes no direct writes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "no direct writes" ON public.committee_question_votes USING (false) WITH CHECK (false);


--
-- Name: profiles prof_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prof_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- Name: profiles prof_select_all_for_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prof_select_all_for_admin ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: profiles prof_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prof_select_self ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: profiles prof_select_trainees_for_instructors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prof_select_trainees_for_instructors ON public.profiles FOR SELECT TO authenticated USING (((role = 'trainee'::public.user_role) AND (public.is_admin(auth.uid()) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'user_metadata'::text) ->> 'role'::text) = 'instructor'::text))));


--
-- Name: profiles prof_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prof_update_own ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- Name: profiles profiles_instructor_reads_trainees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_instructor_reads_trainees ON public.profiles FOR SELECT TO authenticated USING (((role = 'trainee'::public.user_role) AND public.auth_is_instructor(auth.uid())));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: profiles public profile fields readable by trainees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public profile fields readable by trainees" ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: competencies public read competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read competencies" ON public.competencies FOR SELECT TO authenticated USING (true);


--
-- Name: question_options qo_instructor_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qo_instructor_read_all ON public.question_options FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles me
  WHERE ((me.id = auth.uid()) AND (me.role = 'instructor'::public.user_role)))));


--
-- Name: question_options qo_trainee_read_enrolled; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qo_trainee_read_enrolled ON public.question_options FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.competency_questions q
     JOIN public.competency_assignments ca ON ((ca.competency_id = q.competency_id)))
  WHERE ((q.id = question_options.question_id) AND (ca.student_id = auth.uid())))));


--
-- Name: question_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;

--
-- Name: student_answers read answers for leaderboard; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read answers for leaderboard" ON public.student_answers FOR SELECT TO authenticated USING (true);


--
-- Name: competency_assignments read assignments for leaderboard; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read assignments for leaderboard" ON public.competency_assignments FOR SELECT TO authenticated USING (true);


--
-- Name: student_competency_overrides read overrides for leaderboard; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read overrides for leaderboard" ON public.student_competency_overrides FOR SELECT TO authenticated USING (true);


--
-- Name: competency_questions read questions for leaderboard; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read questions for leaderboard" ON public.competency_questions FOR SELECT TO authenticated USING (true);


--
-- Name: profiles read_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_own_profile ON public.profiles FOR SELECT USING ((id = auth.uid()));


--
-- Name: student_answers sa_read_for_instructors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sa_read_for_instructors ON public.student_answers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles me
  WHERE ((me.id = auth.uid()) AND (me.role = ANY (ARRAY['instructor'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: student_answers sa_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sa_read_own ON public.student_answers FOR SELECT TO authenticated USING ((student_id = auth.uid()));


--
-- Name: student_competency_overrides sco_read_for_instructors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sco_read_for_instructors ON public.student_competency_overrides FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles me
  WHERE ((me.id = auth.uid()) AND (me.role = ANY (ARRAY['instructor'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: student_competency_overrides sco_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sco_read_own ON public.student_competency_overrides FOR SELECT TO authenticated USING ((student_id = auth.uid()));


--
-- Name: student_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: student_competency_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_competency_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: student_answers students_manage_their_answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_manage_their_answers ON public.student_answers USING ((auth.uid() = student_id)) WITH CHECK ((auth.uid() = student_id));


--
-- Name: student_answers trainee delete own answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainee delete own answers" ON public.student_answers FOR DELETE USING ((student_id = auth.uid()));


--
-- Name: student_answers trainee insert own answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainee insert own answers" ON public.student_answers FOR INSERT WITH CHECK ((student_id = auth.uid()));


--
-- Name: student_answers trainee read own answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainee read own answers" ON public.student_answers FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: competency_assignments trainee reads own assignment rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainee reads own assignment rows" ON public.competency_assignments FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: student_answers trainee update own answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainee update own answers" ON public.student_answers FOR UPDATE USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- PostgreSQL database dump complete
--

\unrestrict L2bdb98IfwX03OjNomCMtndSFPAgtGuEHKnrEh30ZQp4RyH4LKGrICWTowOYVpL


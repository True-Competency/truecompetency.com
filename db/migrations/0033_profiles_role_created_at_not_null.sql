-- Migration: 0033_profiles_role_created_at_not_null
-- Date: 2026-05-16
-- Purpose: Make profiles.role and profiles.created_at NOT NULL.
-- Author: @novruzoff
--
-- Both columns are documented as nullable in database.md ("role NULL until
-- set"; created_at nullable despite a now() default). In practice:
--   - created_at has a now() default and is structurally never NULL.
--   - role is set atomically by every signup path (standard signup via
--     ensureProfile, committee welcome signup via user_metadata + the
--     sync_profile_from_auth trigger). Production has zero NULL-role rows.
-- The nullable types forced defensive handling in frontend code that no
-- real user ever exercises. Tightening the columns lets the canonical
-- Profile type drop the | null on both fields.
--
-- The guard blocks below abort the migration if any NULL rows exist at
-- apply time, so this cannot silently corrupt or fail mid-flight.

BEGIN;

-- Guard: abort if any NULL role rows exist.
DO $$
DECLARE
  v_null_roles integer;
BEGIN
  SELECT count(*) INTO v_null_roles FROM public.profiles WHERE role IS NULL;
  IF v_null_roles > 0 THEN
    RAISE EXCEPTION 'Aborting: % profiles have NULL role. Backfill before applying.', v_null_roles;
  END IF;
END $$;

-- Guard: abort if any NULL created_at rows exist.
DO $$
DECLARE
  v_null_created integer;
BEGIN
  SELECT count(*) INTO v_null_created FROM public.profiles WHERE created_at IS NULL;
  IF v_null_created > 0 THEN
    RAISE EXCEPTION 'Aborting: % profiles have NULL created_at.', v_null_created;
  END IF;
END $$;

ALTER TABLE public.profiles
  ALTER COLUMN role       SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

COMMIT;
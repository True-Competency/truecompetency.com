# True Competency — Database Guide

This document is the single source of truth for the production database that powers True Competency. It exists so that anyone working on the platform — current or future — can understand how the data is shaped, how access is controlled, and why each piece exists.

This guide is written for developers who are comfortable with code but may not have formal training in databases. Concepts are explained from first principles where it helps, with references to deeper material for anyone who wants to go further.

**Last updated:** 2026-05-15
**Current migration:** `0029_committee_question_editing`
**Database:** Supabase (PostgreSQL 17)

---

## Table of contents

1. [How to read this document](#how-to-read-this-document)
2. [Quick concepts](#quick-concepts)
3. [Roles and identities](#roles-and-identities)
4. [Database architecture overview](#database-architecture-overview)
5. [Tables](#tables)
6. [Views](#views)
7. [Functions and RPCs](#functions-and-rpcs)
8. [Triggers](#triggers)
9. [Row Level Security policies](#row-level-security-policies)
10. [Known issues and cleanup backlog](#known-issues-and-cleanup-backlog)
11. [Keeping this document current](#keeping-this-document-current)

---

## How to read this document

This is a reference document, not a tutorial. You don't have to read it top to bottom. Common ways to use it:

- **You're adding a new feature.** Skim "Database architecture overview" first, then jump to the tables your feature touches and read their full sections.
- **You're debugging a permission issue.** Go to "Row Level Security policies" and find the table involved.
- **You're confused about how data flows.** Read "Database architecture overview" and the table sections in order. The cross-references will lead you naturally through the relationships.
- **You're reviewing a migration.** Find the affected tables/functions in this doc and confirm the migration changes line up with what's documented. **Update the doc as part of the migration commit.**

If something in the database doesn't match what's documented here, **the database is right and the doc is out of date.** Trust the database. Update the doc.

---

## Quick concepts

If you've never worked with a relational database before, read this section. It explains the vocabulary used throughout the rest of the document. If you're already familiar with PostgreSQL, skip to [Database architecture overview](#database-architecture-overview).

### What is a row, column, table

A **table** is like a spreadsheet. It has named **columns** (the headers across the top) and **rows** (the records, one per line). Every row in a table has the same columns.

For example, the `profiles` table stores one row per user. Columns include `id`, `email`, `full_name`, `role`. So a row might be: `(id="abc...", email="murad@example.com", full_name="Murad Novruzov", role="admin")`.

### What is a primary key and a foreign key

A **primary key** is the column (or columns) that uniquely identifies a row in a table. For `profiles`, the primary key is `id` — no two profile rows can have the same `id`. Most tables in True Competency use UUIDs (random 128-bit identifiers) as primary keys, which means the database generates a new unique ID for every row automatically.

A **foreign key** is a column that points to a row in another table. For example, `competency_assignments.student_id` is a foreign key that points to a row in `profiles`. The database enforces this: you can't insert a `competency_assignments` row with a `student_id` that doesn't exist in `profiles`.

Foreign keys also have a **delete behavior**. When the referenced row is deleted, what happens to rows that point to it?

- **CASCADE** — Delete the pointing rows too. (Example: when a profile is deleted, all of that user's `competency_assignments` rows are deleted automatically.)
- **RESTRICT** — Refuse to delete the referenced row if anything points to it. (Example: you can't delete a subgoal if any competency uses it.)
- **SET NULL** — Set the pointing column to NULL but keep the row. (Example: when a profile is deleted, tags they created keep existing but `created_by` becomes NULL.)
- **NO ACTION** — Default for cases not specified, effectively the same as RESTRICT.

These behaviors are listed for every foreign key in the tables section below.

### What is an index

An **index** is a data structure that lets the database look up rows faster. Without an index, finding a specific row in a million-row table means scanning every row. With an index on the relevant column, the database can find the row in milliseconds.

Every primary key automatically has an index. Other indexes are added for columns that are frequently used in lookups (like `student_id` on tables that filter by user).

Indexes have a cost: every INSERT, UPDATE, or DELETE has to update all relevant indexes. So having too many indexes (or duplicate ones) slows down writes. Migration `0028` cleaned up duplicates that had accumulated over time.

### What is a check constraint

A **check constraint** is a rule the database enforces on every row. For example, `competencies.difficulty` has a check that the value must be one of `Beginner`, `Intermediate`, `Advanced`, or `Expert`. Try to insert anything else and the database rejects it.

Check constraints are different from application-side validation: they're enforced at the database level, so they apply even if a developer accidentally bypasses frontend validation.

### What is RLS (Row Level Security)

This is the single most important concept in the True Competency database.

**RLS lets the database itself decide which rows a user can see or change**, based on who they are. The frontend can ask for "all rows from `profiles`," and the database returns *only the rows that user is allowed to see* — not because the frontend filtered them, but because the database refused to give them up.

This matters because **the frontend cannot be trusted to enforce access control.** An attacker can open DevTools, modify the JavaScript, or call the Supabase API directly with any query they want. If the only thing standing between a trainee and another trainee's private data is `WHERE student_id = currentUser.id` in the frontend, the protection doesn't exist — the attacker just removes the filter.

RLS moves the protection into the database. A trainee querying `student_answers` literally cannot see other trainees' answers, no matter what query they run, because the policy attached to that table filters them out before the rows ever leave the database.

Every table in True Competency has RLS enabled. The full set of policies is documented in the [Row Level Security policies](#row-level-security-policies) section.

**Anatomy of a policy:**

A policy has:
- A **name** (e.g. `cq_trainee_read_enrolled`).
- A **command** it applies to: SELECT, INSERT, UPDATE, DELETE, or ALL.
- A **role** it applies to (almost always `authenticated`, sometimes `public` for unauthenticated access).
- A **USING expression** — for reads/updates/deletes, the rule that says which existing rows the user can act on.
- A **WITH CHECK expression** — for inserts/updates, the rule that says what shape new/updated rows must have.

If multiple policies cover the same command on the same table, they're combined with OR (any policy passing is enough).

### What is a function (RPC)

A **function** in the database is a piece of code (PostgreSQL functions are usually written in plpgsql or plain SQL) that lives inside the database and can be called by the application. When called from the frontend through Supabase, these are referred to as **RPCs** (Remote Procedure Calls).

Functions exist for two main reasons:

1. **Encapsulation:** Some operations involve multiple statements that should run together (e.g., "insert a question and its 4 options"). A function packages them as one callable unit.
2. **Privilege escalation:** Some operations need access the caller doesn't have. A function marked `SECURITY DEFINER` lets the operation run with elevated privileges while still enforcing the rules the function itself defines.

### What is SECURITY DEFINER

A function in PostgreSQL can run with two different security models:

- **`SECURITY INVOKER`** (default) — The function runs with the privileges of whoever called it. RLS applies as it would for that user.
- **`SECURITY DEFINER`** — The function runs with the privileges of whoever created the function (usually `postgres`). RLS does not apply. The function can read and write anything.

`SECURITY DEFINER` is the right tool when you need to grant a narrow, controlled escalation. The function does verification, then performs the write with definer privileges. Functions in True Competency typically check `auth.uid()` and validate inputs before performing privileged operations.

### What is a trigger

A **trigger** is a function the database automatically runs in response to an event on a table (INSERT, UPDATE, DELETE). Triggers run as part of the same transaction as the event — if the trigger fails, the whole operation is rolled back.

Triggers in True Competency are used for things like auto-computing `is_correct` on student answers, auto-promoting users to admin role, and preventing role tampering.

### What is a view

A **view** is a saved query that looks like a table when queried. It doesn't store data itself — it computes its rows on demand from underlying tables.

True Competency has two views: `profiles_public` (a safe column-restricted subset of `profiles` for leaderboards) and `student_competency_progress` (computed per-(student, competency) progress percentage).

---

## Roles and identities

True Competency has four roles, encoded as a PostgreSQL enum called `user_role`:

| Role | Purpose |
|------|---------|
| `trainee` | Takes tests, sees their own progress and enrolled competencies. The largest population. |
| `instructor` | Assigns competencies to trainees, reviews progress, can manually mark competencies complete. |
| `committee` | Defines and curates clinical content. Proposes competencies. Can edit/delete live questions. |
| `admin` | Elevated governance. Not a frontend role per se — admins typically use the database directly. |

**Chair (chief editor) is a sub-role of committee.** It's recorded separately in `profiles.committee_role` as either `editor` (default) or `chief_editor`. Only the chair can create or modify the structural shape of the competency framework — new tags, new competencies via direct insert, reorder competencies, reassign subgoals.

**Admin is special.** Admin status is tracked in two places:
- `app_admins` — the source of truth. If your `user_id` is in this table, you are an admin.
- `profiles.role = 'admin'` — a derived column kept in sync by a trigger (`trg_profiles_admin_role`).

Admin grants are managed by directly inserting into `app_admins` via SQL — there is intentionally no UI or RPC for this. Adding an admin is a privilege boundary that requires database access.

**`auth.uid()`** is the function that returns the currently authenticated user's UUID. It's used throughout RLS policies and SECURITY DEFINER functions to identify the caller. If a user is not authenticated, `auth.uid()` returns NULL.

---

## Database architecture overview

True Competency's database is built around six conceptual groups of tables.

### 1. People

Who uses the platform.

- **`profiles`** — One row per user. Stores role, name, country, institution.
- **`app_admins`** — Membership table for admin access.
- **`countries`** — Reference list of countries.

### 2. Content framework

The clinical taxonomy that defines what trainees are learning.

- **`domains`** — Top-level groupings.
- **`subgoals`** — Sub-areas within a domain.
- **`competencies`** — Individual competencies. Each belongs to a subgoal.
- **`competency_questions`** — Multiple-choice questions attached to a competency.
- **`question_options`** — The 4 options for each question. One is marked correct.
- **`question_media`** — Image or video files attached to questions.
- **`tags`** — Flexible labels applied to competencies.

The hierarchy: **domain → subgoal → competency → question → options**.

### 3. Progress and assessment

What individual trainees are doing.

- **`competency_assignments`** — Which competencies each trainee is enrolled in.
- **`student_answers`** — Every answer every trainee has submitted.
- **`student_competency_overrides`** — Instructor-set completion percentages.
- **`student_competency_progress`** *(view)* — Per-trainee, per-competency completion percentage.

### 4. Governance

How clinical content gets approved.

- **`competencies_stage`** — Proposed competencies awaiting review.
- **`committee_votes`** — Votes from committee members on staged competencies.

(Note: the staging table for questions was removed in migration `0011`. Question voting is gone — committee members now write to live questions directly.)

### 5. Auditing

- **`audit_log`** — Append-only history of every change made through the committee question-editing RPCs.

### 6. Plumbing

- **`profiles_public`** *(view)* — A safe subset of `profiles` for leaderboards.

### How the parts connect

A typical end-to-end flow:

1. A user signs up. Supabase Auth creates a row in `auth.users`. A trigger creates a corresponding row in `public.profiles`.
2. An instructor assigns a competency to that trainee. A row appears in `competency_assignments`.
3. The trainee opens the competency and answers questions. Each answer becomes a row in `student_answers`. A trigger automatically computes `is_correct`.
4. The `student_competency_progress` view computes the trainee's percentage from answers + overrides.
5. If the instructor manually marks the competency complete, a row appears in `student_competency_overrides`. The progress view uses this override.

Every step in this flow is protected by RLS.

---

## Tables

For each table you'll find: purpose, columns, foreign keys, indexes/constraints, triggers, and notes.

### `profiles`

**Purpose:** One row per user. Separate from `auth.users` (managed by Supabase), but every `profiles.id` matches an `auth.users.id`.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NO | — | Primary key. Matches the user's `auth.users.id`. |
| `email` | text | NO | — | User's email. Unique. Synced from auth on signup. |
| `full_name` | text | YES | — | Display name. Computed from first/last name via `_make_full_name`. |
| `first_name` | text | YES | — | First name. |
| `last_name` | text | YES | — | Last name. |
| `role` | user_role | YES | — | One of trainee, instructor, committee, admin. NULL until set. |
| `committee_role` | text | YES | — | For committee users only: `editor` or `chief_editor`. |
| `country_code` | text | YES | `'ZZ'` | ISO 2-letter country code. `'ZZ'` means "not yet set." |
| `country_name` | text | YES | — | Country full name. Synced from `countries.name` via trigger. |
| `university` | text | YES | — | Free-text. |
| `hospital` | text | YES | — | Free-text. |
| `avatar_path` | text | YES | — | Storage path to avatar in `profile-pictures` bucket. |
| `created_at` | timestamptz | YES | `now()` | When the profile was created. |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `id` | `auth.users(id)` | CASCADE |
| `country_code` | `countries(code)` | RESTRICT |

**Unique constraints:**
- `email` — case-sensitive (`profiles_email_key`).
- `lower(email)` — case-insensitive (`ux_profiles_email`).

**Check constraints:**
- `committee_role` must be `editor` or `chief_editor` (or NULL).
- `country_code` must match a regex requiring exactly 2 uppercase ASCII letters (anchored start to end).

**Triggers:**
- `trg_sync_country` — Sets `country_name` from `countries.name` when `country_code` is set or changed.
- `trg_profiles_country_uc` — Uppercases `country_code` on insert/update.
- `trg_profiles_admin_role` — Sets `role = 'admin'` if user is in `app_admins`.
- `trg_prevent_role_change` and `trg_profiles_no_role_change` — Block non-admins from changing `role`. (Duplicates — see backlog.)
- `trg_profiles_no_committee_role_change` — Blocks non-admins from changing `committee_role`.
- `trg_profiles_no_committee_role_insert` — Blocks non-admins from inserting `committee_role = 'chief_editor'`.

**Notes:**
- A profile is created automatically when a user signs up via Supabase Auth, via the `sync_profile_from_auth()` trigger on `auth.users`.
- `_make_full_name()` is used by RPCs that touch the profile, not by triggers — be careful to keep `full_name` in sync when editing names directly.

---

### `app_admins`

**Purpose:** Membership table for admin privileges. If your `user_id` is here, you are an admin.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `user_id` | uuid | NO | — | Primary key. References `auth.users(id)`. |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `user_id` | `auth.users(id)` | CASCADE |

**Notes:**
- No INSERT/UPDATE/DELETE policies. Admin grants are done via direct database access — a deliberate privilege boundary.
- `is_app_admin(uid)` is the canonical helper for "is this user an admin?" checks.

---

### `countries`

**Purpose:** Reference list of countries. Used by the signup country dropdown and for displaying country names alongside users.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `code` | char(2) | NO | — | ISO 2-letter code. Primary key. |
| `name` | text | NO | — | Country's full name. Unique. |

**Notes:**
- Read access is granted to the `public` role (unauthenticated users), because the signup page needs the dropdown before login.

---

### `domains`

**Purpose:** Top-level groupings of competencies. Currently the platform has one main domain (interventional cardiology). Managed manually via SQL.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key. |
| `name` | text | NO | — | Display name. |
| `code` | text | NO | — | Short code. Unique. |
| `position` | integer | NO | `0` | Display ordering. |
| `description` | text | YES | — | Optional. |
| `created_at` | timestamptz | NO | `now()` | — |

**Foreign keys:** None.

---

### `subgoals`

**Purpose:** Sub-areas within a domain. Competencies are organized by subgoal.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key. |
| `domain_id` | uuid | NO | — | Which domain. |
| `name` | text | NO | — | Display name. |
| `code` | text | NO | — | Short code, unique within the parent domain. |
| `position` | integer | NO | `0` | Display ordering within the parent domain. |
| `description` | text | YES | — | Optional. |
| `created_at` | timestamptz | NO | `now()` | — |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `domain_id` | `domains(id)` | RESTRICT |

**Unique constraints:**
- `(domain_id, code)` — codes are unique within a domain.

---

### `tags`

**Purpose:** Flexible labels for competencies. Only the chair can create, rename, or delete tags.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key. |
| `name` | text | NO | — | Display name. Unique. Leading hash characters are stripped. |
| `created_by` | uuid | YES | — | The chair who created the tag. |
| `created_at` | timestamptz | YES | `now()` | — |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `created_by` | `profiles(id)` | SET NULL |

**Notes:**
- Tags are referenced by competencies through the `competencies.tags` array column (uuid array, NOT a foreign key — PostgreSQL doesn't enforce FKs on array elements). When a tag is deleted via `chair_delete_tag`, the function manually removes the tag's ID from every competency's `tags` array.

---

### `competencies`

**Purpose:** The individual learning units. Each belongs to a subgoal and has a difficulty level.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key. (Real PK constraint name: `ic_competency_pkey`, a legacy quirk.) |
| `name` | text | NO | — | Competency name. Case-insensitive unique. |
| `difficulty` | text | NO | — | One of Beginner, Intermediate, Advanced, Expert. |
| `test_question` | text | YES | — | Legacy column. Unused. |
| `position` | integer | YES | — | Display ordering across all competencies. |
| `tags` | uuid[] | YES | `'{}'` | Array of tag IDs. References `tags(id)` but not as a foreign key. |
| `subgoal_id` | uuid | YES | — | Which subgoal. |
| `created_at` | timestamptz | NO | `now()` | — |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `subgoal_id` | `subgoals(id)` | RESTRICT |

**Unique constraints:**
- `lower(name)` — competency names are case-insensitive unique.

**Check constraints:**
- `difficulty` must be one of Beginner, Intermediate, Advanced, Expert.

**Notes:**
- The check constraint allows 4 difficulty values, but the `chair_create_competency` RPC only validates against 3 (missing `Advanced`). See backlog.

---

### `competency_questions`

**Purpose:** Multiple-choice questions attached to competencies.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key. |
| `competency_id` | uuid | NO | — | The competency. |
| `body` | text | NO | — | The question text. |
| `created_at` | timestamptz | NO | `now()` | — |
| `updated_at` | timestamptz | NO | `now()` | Stamped by every successful committee edit RPC. |
| `updated_by` | uuid | YES | — | The committee member or admin who made the last edit. |
| `deleted_at` | timestamptz | YES | — | Soft-delete marker. NULL means the row is live. |
| `deleted_by` | uuid | YES | — | Who soft-deleted the row. |
| `version` | integer | NO | `1` | Optimistic-lock counter. Incremented on every successful write. |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `competency_id` | `competencies(id)` | CASCADE |
| `updated_by` | `profiles(id)` | SET NULL |
| `deleted_by` | `profiles(id)` | SET NULL |

**Notes:**
- `version` is used for optimistic locking: the committee edit RPCs require the client to send the version it last read, and reject the write with a P0001 error if the row has changed in the meantime.
- `deleted_at IS NULL` means the row is live. Soft-deleted questions are hidden from trainees by RLS but remain visible to committee, instructor, and admin.
- Edits and deletes happen through the `committee_*` RPCs (added in migration `0029`); each write also inserts a row into `audit_log` in the same transaction.
- Questions are written directly by committee members (no staging, no voting since migration `0011`).

---

### `question_options`

**Purpose:** The 4 multiple-choice options for each question. Exactly one must be marked correct.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key. |
| `question_id` | uuid | NO | — | The question. |
| `body` | text | NO | — | The option text. |
| `is_correct` | boolean | NO | `false` | Exactly one per question must be true. |
| `sort_order` | integer | NO | — | Display order, 0-indexed. |
| `created_at` | timestamptz | NO | `now()` | — |
| `updated_at` | timestamptz | NO | `now()` | Stamped by every successful committee edit RPC. |
| `updated_by` | uuid | YES | — | The committee member or admin who made the last edit. |
| `deleted_at` | timestamptz | YES | — | Soft-delete marker. NULL means the row is live. |
| `deleted_by` | uuid | YES | — | Who soft-deleted the row. |
| `version` | integer | NO | `1` | Optimistic-lock counter. Incremented on every successful write. |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `question_id` | `competency_questions(id)` | CASCADE |
| `updated_by` | `profiles(id)` | SET NULL |
| `deleted_by` | `profiles(id)` | SET NULL |

**Unique constraints:**
- `question_options_question_id_sort_order_active_idx` — partial unique index on `(question_id, sort_order) WHERE deleted_at IS NULL`. No two **live** options for the same question share a sort order. The old full-table unique constraint was dropped in migration `0029` so that a sort_order slot can be re-used after a soft delete.
- `question_options_one_correct_active_idx` — partial unique index on `(question_id) WHERE is_correct = true AND deleted_at IS NULL`. Enforces "at most one correct option per question" among live options only, so the correct flag can be re-used after a soft delete.

**Notes:**
- The one-correct-per-question invariant is enforced by the partial unique index above. Changes to `is_correct` go through `committee_set_correct_option`, which demotes the old correct option and promotes the new one atomically inside a single transaction (locking the question row) to preserve the invariant.

---

### `question_media`

**Purpose:** Image or video files attached to questions. Files live in the `question-media` Supabase Storage bucket; this table holds the metadata.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key. |
| `question_id` | uuid | YES | — | The question. |
| `uploaded_by` | uuid | NO | — | The committee member who uploaded. |
| `storage_path` | text | NO | — | Full path in the storage bucket. |
| `file_name` | text | NO | — | Display filename. |
| `file_type` | text | NO | — | Either `image` or `video`. |
| `mime_type` | text | NO | — | Full MIME type. |
| `file_size` | bigint | NO | — | Bytes. Must be > 0. |
| `created_at` | timestamptz | NO | `now()` | — |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `question_id` | `competency_questions(id)` | CASCADE (the files in storage are NOT deleted automatically) |
| `uploaded_by` | `profiles(id)` | RESTRICT |

**Check constraints:**
- `file_type` must be `image` or `video`.
- `file_size > 0`.

**Notes:**
- Storage files and DB rows can drift out of sync. Managing media requires careful coordination.
- Originally had a `stage_id` column for staged-question media; dropped in migration `0011`.

---

### `competencies_stage`

**Purpose:** Proposed competencies awaiting committee review. Currently being redesigned.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key. |
| `name` | text | NO | — | Proposed name. |
| `difficulty` | text | NO | — | Proposed difficulty. |
| `justification` | text | YES | — | Free-text rationale. |
| `suggested_by` | uuid | YES | — | The proposer. |
| `tags` | uuid[] | YES | `'{}'` | Proposed tag IDs. |
| `subgoal_id` | uuid | YES | — | Proposed subgoal. |
| `created_at` | timestamptz | NO | `now()` | — |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `suggested_by` | `profiles(id)` | SET NULL |
| `subgoal_id` | `subgoals(id)` | RESTRICT |

**Unique constraints:**
- `(lower(name), difficulty)` — no two proposals with the same name+difficulty.

---

### `committee_votes`

**Purpose:** One row per (committee member, staged competency) pair. The chair uses the tally to inform their decision.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key. |
| `stage_id` | uuid | NO | — | Which staged competency. |
| `voter_id` | uuid | NO | — | The committee member. |
| `vote` | boolean | NO | — | true = yes, false = no. |
| `created_at` | timestamptz | NO | `now()` | — |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `stage_id` | `competencies_stage(id)` | CASCADE |
| `voter_id` | `profiles(id)` | CASCADE |

**Unique constraints:**
- `(stage_id, voter_id)` — one vote per voter per stage row.

---

### `competency_assignments`

**Purpose:** Which trainees are assigned to which competencies. A trainee sees questions only for assigned competencies.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `student_id` | uuid | NO | — | The trainee. Part of composite PK. |
| `competency_id` | uuid | NO | — | The competency. Part of composite PK. |
| `assigned_at` | timestamptz | NO | `now()` | — |
| `assigned_by` | uuid | YES | — | The instructor/admin. NULL for self-enrollment. |

**Primary key:** Composite `(student_id, competency_id)`.

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `student_id` | `profiles(id)` | CASCADE |
| `competency_id` | `competencies(id)` | CASCADE |
| `assigned_by` | `profiles(id)` | NO ACTION (preserves audit trail) |

**Notes:**
- Column is named `student_id` for historical reasons. Product term is "trainee." Rename planned.
- `assigned_by` powers the trainee-to-instructor relationship that `prof_select_assigned_instructor` RLS uses.

---

### `student_answers`

**Purpose:** Every trainee answer. Composite PK means one answer per (trainee, question) — re-answering updates the row.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `student_id` | uuid | NO | — | Trainee. Part of composite PK. |
| `question_id` | uuid | NO | — | Question. Part of composite PK. |
| `selected_option_id` | uuid | NO | — | Which option was picked. |
| `is_correct` | boolean | NO | — | Auto-computed by trigger. |
| `answer_text` | text | YES | — | For free-text answers (future). |
| `answered_at` | timestamptz | NO | `now()` | When the answer was submitted. |

**Primary key:** Composite `(student_id, question_id)`.

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `student_id` | `profiles(id)` | CASCADE |
| `question_id` | `competency_questions(id)` | CASCADE |
| `selected_option_id` | `question_options(id)` | SET NULL |

**Check constraints:**
- Either `selected_option_id` is set AND `answer_text` is NULL, OR vice versa.

**Triggers:**
- `trg_regrade_answer` — On INSERT/UPDATE, computes `is_correct` from the selected option.
- `trg_set_is_correct` — Duplicate, should be dropped (see backlog).

**Notes:**
- `is_correct` is frozen at the time of answering. If a question's correct option changes later, existing answers keep their original `is_correct`. New attempts use the new correct option.

---

### `student_competency_overrides`

**Purpose:** Lets an instructor or admin manually set a trainee's completion percentage for a competency. Overrides the computed percentage.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `student_id` | uuid | NO | — | Trainee. Part of composite PK. |
| `competency_id` | uuid | NO | — | Competency. Part of composite PK. |
| `pct` | integer | NO | — | Override percentage. 0-100. |
| `approved_by` | uuid | YES | — | Who set the override. |
| `approved_at` | timestamptz | NO | `now()` | When. Updated on re-set. |

**Primary key:** Composite `(student_id, competency_id)`.

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `student_id` | `profiles(id)` | CASCADE |
| `competency_id` | `competencies(id)` | CASCADE |
| `approved_by` | `profiles(id)` | NO ACTION |

**Check constraints:**
- `pct` between 0 and 100.

**Notes:**
- Writes go through `instructor_mark_competency_complete` RPC. No direct INSERT/UPDATE/DELETE policies for non-admins.

---

### `audit_log`

**Purpose:** Append-only record of every change made through the `committee_*` question-editing RPCs. The table is self-contained: `old_values` and `new_values` are full JSONB row snapshots, so an auditor can reconstruct any past state of any audited row even if the row no longer exists.

**Columns:**

| Column | Type | Nullable | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key. |
| `table_name` | text | NO | — | Name of the audited table (e.g. `competency_questions`, `question_options`). |
| `row_id` | uuid | NO | — | Primary key of the row that was changed. |
| `action` | text | NO | — | One of `insert`, `update`, `soft_delete`. |
| `actor_id` | uuid | YES | — | The user who performed the change. |
| `old_values` | jsonb | YES | — | Full pre-change row snapshot. NULL for inserts. |
| `new_values` | jsonb | YES | — | Full post-change row snapshot. |
| `created_at` | timestamptz | NO | `now()` | When the change happened. |

**Foreign keys:**

| Column | References | On delete |
|---|---|---|
| `actor_id` | `profiles(id)` | SET NULL |

**Check constraints:**
- `action` must be one of `insert`, `update`, `soft_delete`.

**Indexes:**
- `audit_log_row_idx` on `(table_name, row_id, created_at DESC)` — "history of this row" lookups.
- `audit_log_actor_idx` on `(actor_id, created_at DESC)` — "activity by this actor" lookups.

**Notes:**
- RLS is enabled. The only policy is `al_admin_read`, granting SELECT to admins. There are intentionally no INSERT/UPDATE/DELETE policies: all writes happen through `SECURITY DEFINER` RPCs that bypass RLS, and the RPCs only insert — they never update or delete audit rows. The table is append-only at the RPC layer too.

---

## Views

### `profiles_public`

**Purpose:** A safe subset of `profiles` for displaying users in places where contact info shouldn't be exposed (leaderboards, public lists).

**Columns exposed:** `id`, `full_name`, `first_name`, `last_name`, `country_name`, `country_code`, `role`.

**Columns NOT exposed:** `email`, `university`, `hospital`, `committee_role`, `avatar_path`, `created_at`.

**Notes:**
- Configured with `security_invoker = false`, so it runs with the privileges of the view's owner (`postgres`) and bypasses RLS on the underlying `profiles` table. The column list IS the access control. Do not widen this list without redesigning the access pattern.
- Supabase's linter flags this view as `0010_security_definer_view`. The warning is acknowledged and the design is intentional.

---

### `student_competency_progress`

**Purpose:** The source of truth for "how far along is this trainee on this competency?"

**What it computes:**

For each (student, competency) where the student is assigned:
1. **Total questions** (denominator): count of **live** questions in the competency — `competency_questions` rows with `deleted_at IS NULL`. Soft-deleted questions are excluded.
2. **Correct numerator**: count of distinct correct answers across **all** of that competency's questions, including soft-deleted ones. This preserves a trainee's credit when a question is later removed from the curriculum — what Marc calls "course-syllabus semantics" (B2).
3. **Percentage**: `pct_answers = LEAST(100, round(100 * correct / total))`. The cap at 100 matters because a trainee whose correct-answer count exceeds the new live-question count after a deletion would otherwise show > 100%.
4. **Answered questions** (the displayed "X of Y answered" count): counts only answers on **live** questions, so the UI math stays coherent after a question is deleted.
5. **Override**: if a row exists in `student_competency_overrides` for that (student, competency), its `pct` wins over the computed value.

**Columns returned:** `student_id`, `competency_id`, `total_questions`, `answered_questions`, `pct`.

**Notes:**
- "Answered correctly" is counted as distinct question IDs where `is_correct = true`. Re-answering doesn't double-count.
- Zero-question competencies have `pct_answers = 0` (no divide-by-zero).
- The view inherits RLS from its underlying tables.
- Soft-deleting a question makes a trainee's percentage go **up**, not down: the denominator shrinks while the numerator is preserved. Trainees never see their progress drop because of a curriculum change. This is course-syllabus semantics per Marc's guidance.

---

## Functions and RPCs

Functions in functional groups, not alphabetical.

### Helper functions

**`_make_full_name(p_first text, p_last text) → text`**
Concatenates first and last name into a single full name, trimming whitespace. Returns NULL if both inputs are empty. `IMMUTABLE`, `INVOKER`.

**`is_app_admin(uid uuid) → boolean`**
Returns true if the user is in `app_admins`. Used in many RLS policies. `STABLE`, `SECURITY DEFINER`.

**`is_admin(p_uid uuid) → boolean`**
Identical to `is_app_admin`. Duplicate, should be consolidated.

### Auth helpers (for RLS)

These functions exist to break recursion in RLS policies that need to check a user's role.

**`auth_is_instructor(uid uuid) → boolean`**
Returns true if the user has `role = 'instructor'`. `SECURITY DEFINER`. Marked `VOLATILE` but should be `STABLE`.

**`auth_is_committee(uid uuid) → boolean`**
Returns true if the user has `role = 'committee'`. `STABLE`, `SECURITY DEFINER`. Added in migration `0021`.

**`auth_has_assigned_instructor(trainee_id uuid, instructor_id uuid) → boolean`**
Returns true if `instructor_id` has assigned at least one competency to `trainee_id`. `STABLE`, `SECURITY DEFINER`. Added in migration `0022`.

### Chair-only RPCs

All `SECURITY DEFINER`. Each validates the caller has `committee_role = 'chief_editor'`.

**`chair_create_competency(p_name text, p_difficulty text, p_tags uuid[], p_subgoal_id uuid) → uuid`**
Creates a new live competency directly (bypassing staging). Validates inputs. Auto-assigns `position` at end of list. Returns the new ID. **Note:** validates difficulty against 3 values, missing `Advanced` (see backlog).

**`chair_create_question(p_competency_id uuid, p_question_text text, p_options text[], p_correct_index integer) → uuid`**
Creates a new question with exactly 4 options. Validates everything.

**`chair_create_tag(p_name text) → uuid`**
Creates a new tag. Strips leading hash characters.

**`chair_rename_tag(p_tag_id uuid, p_new_name text) → void`**
Renames a tag.

**`chair_delete_tag(p_tag_id uuid) → void`**
Deletes a tag. Also removes the tag ID from every competency's `tags` array (both live and staged), since PostgreSQL doesn't enforce FKs on array elements.

**`chair_reorder_competencies(p_ordered_ids uuid[]) → void`**
Takes competency IDs in display order. Updates `position` on each.

**`chair_reassign_competency_subgoals(p_ids uuid[], p_subgoal_ids uuid[]) → void`**
Bulk-updates `subgoal_id` of multiple competencies. Validates input thoroughly.

### Committee question-editing RPCs

These RPCs are how committee members edit live questions and options. Direct table writes are blocked by RLS; all changes flow through these functions, which enforce role checks, version-based optimistic locking, and audit logging. All are `SECURITY DEFINER` and require the caller to be either a committee member (`auth_is_committee`) or an admin (`is_app_admin`). Every successful write inserts one row into `audit_log` in the same transaction.

**`committee_update_question(p_id uuid, p_body text, p_expected_version integer) → integer`**
Updates a question's body. Validates non-empty body, checks the question exists and is not soft-deleted, and rejects with `P0001` if `p_expected_version` doesn't match the current `version`. Bumps `version`, stamps `updated_at`/`updated_by`, and writes an `update` audit entry. Returns the new version.

**`committee_update_option(p_id uuid, p_body text, p_sort_order integer, p_expected_version integer) → integer`**
Updates an option's body and sort_order only — `is_correct` is changed via `committee_set_correct_option` to preserve the one-correct-per-question invariant atomically. Same validation and optimistic-locking pattern as `committee_update_question`. Returns the new version.

**`committee_set_correct_option(p_question_id uuid, p_new_correct_option_id uuid) → void`**
Atomically demotes the current correct option (if any) and promotes the specified one. Locks the parent question row with `FOR UPDATE` to serialize concurrent attempts on the same question. Verifies the candidate option belongs to the question and is live. Both options get version-bumped and each gets its own `update` audit entry. No-op if the candidate is already the correct option.

**`committee_add_option(p_question_id uuid, p_body text, p_sort_order integer) → uuid`**
Inserts a new option, always with `is_correct = false` — use `committee_set_correct_option` afterward to change correctness. Validates non-empty body, non-negative sort_order, and that the parent question exists and is not soft-deleted. Writes an `insert` audit entry. Returns the new option's id.

**`committee_delete_option(p_id uuid, p_expected_version integer) → void`**
Soft-deletes an option. **Rejects deletion of the currently-correct option** to protect the one-correct-per-question invariant — to delete the correct option, first call `committee_set_correct_option` to move correctness elsewhere. Sets `deleted_at`/`deleted_by`, bumps `version`, and writes a `soft_delete` audit entry.

**`committee_delete_question(p_id uuid, p_expected_version integer) → void`**
Soft-deletes the question and **cascades the soft-delete to every live option** of that question. Each cascaded option gets its own `soft_delete` audit entry, so the history is fully reconstructable per row. Standard optimistic-locking and not-already-deleted checks on the question.

### Instructor and user RPCs

**`instructor_mark_competency_complete(p_student_id uuid, p_competency_id uuid) → void`**
Inserts or updates a row in `student_competency_overrides` with `pct = 100`. `SECURITY DEFINER` with explicit role check.

**`delete_user_account(p_user_id uuid) → void`**
Lets a user delete their own account. Verifies caller IS the user being deleted. Deletes related data in FK dependency order.

**`ensure_profile_rpc(p_email text, p_role user_role, p_first_name text, p_last_name text) → profiles`**
Upsert by current user ID. Creates the profile if missing; updates only NULL fields if it exists. Safety net for signup flow.

**`set_user_role(p_user_id uuid, p_role user_role) → void`**
Admin utility. Sets a user's role. No explicit caller check — protected by EXECUTE grants.

### Broken or deprecated

**`set_user_admin(p_user_id uuid, p_is_admin boolean) → void`**
**Broken.** Updates `profiles.is_admin` which doesn't exist as a column. Would error if called. Should be dropped.

**`merge_competencies_from_stage(p_stage_table text) → record`**
Older bulk-merge function. Will be obsolete with the competency lifecycle redesign.

**`competencies_search_tsv()` (trigger function)**
**Broken.** References columns that don't exist on `competencies`. No trigger attached. Dead code.

### Trigger-only functions

Wired up as triggers, not called directly:
- `regrade_answer` — grades student_answers.
- `set_is_correct` — duplicate of above.
- `set_admin_role_on_profiles` — auto-promote admins.
- `sync_country_name` — fill country_name from country_code.
- `sync_profile_from_auth` — create profile from auth.users on signup.
- `fn_profiles_country_uc` — uppercase country_code.
- `prevent_role_change` / `prevent_role_change_unless_admin` — duplicate role-change guards.
- `prevent_committee_role_change_unless_admin` — committee_role change guard.
- `prevent_committee_role_insert_unless_admin` — committee_role insert guard.
- `set_updated_at` — generic updated_at stamper.

---

## Triggers

### Triggers on `profiles`

| Trigger | Fires on | What it does |
|---|---|---|
| `trg_sync_country` | BEFORE INSERT/UPDATE OF country_code | Looks up country name, fills `country_name`. |
| `trg_profiles_country_uc` | BEFORE INSERT/UPDATE | Uppercases `country_code`. |
| `trg_profiles_admin_role` | BEFORE INSERT/UPDATE | Sets `role = 'admin'` if user is in `app_admins`. |
| `trg_prevent_role_change` | BEFORE UPDATE | Blocks non-admins from changing `role`. |
| `trg_profiles_no_role_change` | BEFORE UPDATE | Duplicate of above. Drop one (backlog). |
| `trg_profiles_no_committee_role_change` | BEFORE UPDATE | Blocks non-admins from changing `committee_role`. |
| `trg_profiles_no_committee_role_insert` | BEFORE INSERT | Blocks non-admins from inserting `committee_role = 'chief_editor'`. |

### Triggers on `student_answers`

| Trigger | Fires on | What it does |
|---|---|---|
| `trg_regrade_answer` | BEFORE INSERT/UPDATE | Looks up correct option, sets `is_correct`. Also nulls `answer_text` and stamps `answered_at`. |
| `trg_set_is_correct` | BEFORE INSERT/UPDATE OF selected_option_id | Duplicate. Drop (backlog). |

### Triggers on `auth.users`

`sync_profile_from_auth()` is attached to `auth.users` (in the `auth` schema). It runs on user signup to create a corresponding `profiles` row. Not visible in `public` schema queries but is part of how the system works.

---

## Row Level Security policies

Conventions:
- Policy names use table-prefix abbreviations: `prof_*` on `profiles`, `cq_*` on `competency_questions`, etc.
- Prefix map: `prof`, `aa` (app_admins), `comp` (competencies), `cs` (competencies_stage), `cv` (committee_votes), `ca` (competency_assignments), `cq` (competency_questions), `qo` (question_options), `qm` (question_media), `sa` (student_answers), `sco` (student_competency_overrides), `co` (countries), `dom` (domains), `sg` (subgoals), `tg` (tags).
- "Admin-all" policies grant full access to users in `app_admins` and follow the same pattern across tables.
- Every policy applies to the `authenticated` role unless noted.

### `profiles`

- **`prof_insert_own`** (INSERT) — A user can create a profile only for themselves.
- **`prof_update_own`** (UPDATE) — A user can update only their own profile.
- **`prof_select_self`** (SELECT) — A user can read their own profile.
- **`prof_select_all_for_admin`** (SELECT) — Admins read every profile.
- **`prof_select_instructor_reads_trainees`** (SELECT) — Instructors read all trainee profiles.
- **`prof_select_committee_peers`** (SELECT) — Committee members read other committee members' profiles.
- **`prof_select_assigned_instructor`** (SELECT) — Trainees read profiles of instructors who have assigned them competencies.

No DELETE policy — deletion goes through `delete_user_account()` RPC.

### `app_admins`

- **`aa_read_own`** (SELECT) — User sees their own row.
- **`aa_admin_read_all`** (SELECT) — Admin sees all admins.

No INSERT/UPDATE/DELETE policies. Admin grants require direct database access.

### `countries`

- **`co_read_public`** (SELECT, role: `public`) — Anyone, including unauthenticated, reads the country list.
- **`co_admin_all`** (ALL) — Admin modifies.

### `domains`

- **`dom_read_all_authenticated`** (SELECT) — Every authenticated user reads all domains.
- **`dom_admin_all`** (ALL) — Admin modifies.

### `subgoals`

- **`sg_read_all_authenticated`** (SELECT) — Every authenticated user reads all subgoals.
- **`sg_admin_all`** (ALL) — Admin modifies.

### `tags`

- **`tg_read_all_authenticated`** (SELECT) — Every authenticated user reads tags.
- **`tg_chair_insert`** (INSERT) — Only chair creates.
- **`tg_chair_delete`** (DELETE) — Only chair deletes (via RPC that handles array cleanup).
- **`tg_admin_all`** (ALL) — Admin modifies.

No UPDATE policy — renames go through `chair_rename_tag` RPC.

### `competencies`

- **`comp_read_all_authenticated`** (SELECT) — Every authenticated user reads all competencies.
- **`comp_admin_all`** (ALL) — Admin modifies.

No INSERT/UPDATE/DELETE policies for non-admins — writes go through chair RPCs.

### `competencies_stage`

- **`cs_governance_read`** (SELECT) — Committee members and admins read stage rows.
- **`cs_committee_insert`** (INSERT) — Committee members propose competencies. Requires `suggested_by = auth.uid()`.
- **`cs_admin_all`** (ALL) — Admin modifies.

### `committee_votes`

- **`cv_committee_read_all`** (SELECT) — Committee members read all votes.
- **`cv_committee_manage_own`** (ALL) — A committee member manages their own vote rows.
- **`cv_admin_all`** (ALL) — Admin modifies.

### `competency_questions`

- **`cq_committee_read`** (SELECT) — Committee reads all questions.
- **`cq_instructor_read_all`** (SELECT) — Instructors read all questions.
- **`cq_trainee_read_enrolled`** (SELECT) — Trainees read questions only for enrolled competencies, and only when the question is live (`deleted_at IS NULL`). Soft-deleted questions are hidden from trainees.
- **`cq_admin_all`** (ALL) — Admin modifies.

### `question_options`

Same pattern as `competency_questions`:
- **`qo_committee_read`**, **`qo_instructor_read_all`** (SELECT).
- **`qo_trainee_read_enrolled`** (SELECT) — Trainees read options only for enrolled competencies, and only when both the option and its parent question are live (`question_options.deleted_at IS NULL` AND the parent `competency_questions.deleted_at IS NULL`).
- **`qo_admin_all`** (ALL).

### `question_media`

- **`qm_committee_read`** (SELECT) — Committee reads all media.
- **`qm_instructor_read_all`** (SELECT) — Instructors read all media.
- **`qm_trainee_read_enrolled`** (SELECT) — Trainees read media only for enrolled competencies, and only when the parent question is live (`competency_questions.deleted_at IS NULL`).
- **`qm_committee_insert`** (INSERT) — Any committee member uploads. Requires `uploaded_by = auth.uid()`.
- **`qm_committee_delete`** (DELETE) — Any committee member deletes any media.
- **`qm_admin_all`** (ALL) — Admin modifies.

No UPDATE policy — replacement is delete + new insert.

### `competency_assignments`

- **`ca_trainee_read_own`** (SELECT) — Trainees read their own.
- **`ca_trainee_insert_own`** (INSERT) — Trainees self-enroll.
- **`ca_trainee_update_own`** (UPDATE) — Trainees update their own.
- **`ca_instructor_read_all`** (SELECT) — Instructors/admins read all.
- **`ca_instructor_insert`** (INSERT) — Instructors/admins insert for anyone.
- **`ca_instructor_update`** (UPDATE) — Instructors/admins update.
- **`ca_admin_all`** (ALL).

### `student_answers`

- **`sa_trainee_manage_own`** (ALL) — A trainee manages their own answer rows. Grading via trigger.
- **`sa_read_for_instructors`** (SELECT) — Instructors and admins read all.
- **`sa_admin_all`** (ALL).

### `student_competency_overrides`

- **`sco_read_own`** (SELECT) — Trainees read their own override rows.
- **`sco_read_for_instructors`** (SELECT) — Instructors and admins read all.
- **`sco_admin_all`** (ALL).

No INSERT/UPDATE/DELETE policies for non-admins. Writes go through `instructor_mark_competency_complete` RPC.

### `audit_log`

- **`al_admin_read`** (SELECT) — Admins read all audit entries.

No other policies. All writes go through `SECURITY DEFINER` committee RPCs, which bypass RLS and only ever insert — so the table is append-only at both the RLS and RPC layers.

---

## Known issues and cleanup backlog

Discovered during the database audit on 2026-05-13. Non-urgent but worth tracking.

### Schema-level inconsistencies

**1. `student_*` tables/columns vs. product terminology.**
The product uses "trainee" everywhere; the schema uses "student". A rename is planned but is a multi-day refactor.

**2. Duplicate `country_code` constraints on `profiles`.**
`profiles_country_code_chk` requires exactly 2 uppercase letters (anchored regex). `profiles_country_code_len` allows NULL or length 2-3. The first is strictly tighter; the second adds no protection.

**3. `competencies.difficulty` allows 4 values but `chair_create_competency` only validates 3.**
Check constraint permits Beginner, Intermediate, Advanced, Expert. RPC accepts only Beginner, Intermediate, Expert (missing Advanced).

**4. `competencies` primary key is named `ic_competency_pkey`.**
Legacy name from earlier table name. Functional but inconsistent.

### Duplicate database objects

**5. `prevent_role_change` and `prevent_role_change_unless_admin` are duplicate trigger functions, both attached as triggers.**

**6. `set_is_correct` is a duplicate of `regrade_answer`.**
Both compute `is_correct` on `student_answers`. Drop `set_is_correct` and its trigger.

**7. `is_admin` and `is_app_admin` are duplicate functions.**
Pick one as canonical, update callers, drop the other.

**8. `auth_is_instructor` has wrong volatility.**
Should be `STABLE` like the other auth helpers.

### Dead code

**9. `competencies_search_tsv()` is dead.**
References columns that don't exist. No trigger attached. Drop.

**10. `set_user_admin()` is broken.**
References `profiles.is_admin` which doesn't exist. Drop.

**11. `merge_competencies_from_stage()` is obsolete.**
Predates current governance design. Drop with the redesign.

### Linter warnings

**12. `profiles_public` view is flagged as `SECURITY DEFINER` view.**
Supabase linter `0010_security_definer_view`. Intentional design; warning acknowledged.

### Future feature work

**13. Frontend UI for committee question editing.**
RPCs and audit log exist (migration `0029`); the frontend edit/delete UI is still to be built.

**14. Competency lifecycle redesign.**
Replaces auto-merge-on-vote with chair-decided approval. Stage rows kept forever for audit. New columns and tables. Multi-proposal threads.

**15. Forward-looking RLS policies not yet exercised.**
`prof_select_assigned_instructor` is in place but no frontend feature uses it yet.

### Operational gaps

**16. No production database backups beyond manual.**
Production Supabase is on the free tier. Local backups taken monthly via `pg_dump`. Supabase Pro upgrade pending for managed backups.

---

## Keeping this document current

This document is only useful if it stays in sync with the database. **Update it as part of every migration that changes schema, RLS, functions, or triggers.**

### The update checklist

When you ship a migration to production:

1. **Bump the metadata at the top:**
   - `Last updated:` to today's date.
   - `Current migration:` to the migration number just shipped.

2. **Update the relevant section** based on what the migration changed:

   | If the migration… | Update… |
   |---|---|
   | Adds/removes a table | "Database architecture overview" + add/remove the table's section |
   | Adds/removes/changes a column | The "Columns" table in that table's section |
   | Adds/removes a foreign key | The "Foreign keys" table |
   | Adds/removes a check constraint | The "Check constraints" list |
   | Adds/removes/changes a function | The "Functions and RPCs" section |
   | Adds/removes/changes a trigger | "Triggers" section + the table's "Triggers" subsection |
   | Adds/removes/changes an RLS policy | "Row Level Security policies" section |
   | Adds/removes a view | "Views" section |
   | Fixes a backlog item | Remove it from "Known issues" |
   | Discovers a new issue | Add it to "Known issues" |

3. **Commit the doc update** as part of the same PR as the migration. Commit message:

   ```
   docs(db): update database guide for migration NNNN
   ```

### What "in sync" means

If you query the production database and the answer doesn't match what this document says, **the database is right and this document is wrong.** Update it.

### Periodic full audit

Once a quarter, pull a fresh introspection of the database and compare against this doc. Fix any drift.

---

*End of document.*

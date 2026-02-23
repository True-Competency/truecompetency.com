-- ============================================
-- Step 1: Create tags table
-- ============================================
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================
-- Step 2: Seed tags from existing competencies
-- Strip the '#' prefix — hashtag is display-only
-- created_by is NULL for seeded tags (system-created)
-- ============================================

INSERT INTO tags (name, created_by)
VALUES
  ('Artifact', NULL),
  ('Artifical Intelligence', NULL),
  ('Calcium', NULL),
  ('Clinical Application', NULL),
  ('Clinical Trials', NULL),
  ('Complication', NULL),
  ('CTO', NULL),
  ('Image Interpretation', NULL),
  ('IVUS', NULL),
  ('Left Main', NULL),
  ('Measurement', NULL),
  ('Pathophysiology', NULL),
  ('PCI', NULL),
  ('Pharmacology', NULL),
  ('Physics', NULL),
  ('Procedure', NULL)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- Step 3: Add new UUID array column for tag IDs
-- Keep old tags column temporarily as backup
-- ============================================
ALTER TABLE competencies
  ADD COLUMN tag_ids UUID[] DEFAULT '{}';

-- ============================================
-- Step 4: Populate tag_ids by mapping old text tags to UUIDs
-- ============================================
UPDATE competencies c
SET tag_ids = ARRAY(
  SELECT t.id
  FROM tags t
  WHERE ('#' || t.name) = ANY(c.tags)
);

-- ============================================
-- Step 5: Verify — spot check a few rows
-- Should show matching tag names and IDs
-- ============================================
SELECT 
  c.tags as old_tags,
  c.tag_ids,
  ARRAY(
    SELECT t.name FROM tags t WHERE t.id = ANY(c.tag_ids)
  ) as new_tag_names
FROM competencies c
LIMIT 5;

-- ============================================
-- Step 6: Rename tag_ids to tags, drop old column
-- ============================================
ALTER TABLE competencies RENAME COLUMN tags TO tags_old;
ALTER TABLE competencies RENAME COLUMN tag_ids TO tags;
ALTER TABLE competencies DROP COLUMN tags_old;

-- ============================================
-- Step 7: Do the same for competencies_stage
-- (proposals also have tags that need migrating)
-- ============================================
ALTER TABLE competencies_stage
  ADD COLUMN tag_ids UUID[] DEFAULT '{}';

UPDATE competencies_stage c
SET tag_ids = ARRAY(
  SELECT t.id
  FROM tags t
  WHERE ('#' || t.name) = ANY(c.tags)
);

ALTER TABLE competencies_stage RENAME COLUMN tags TO tags_old;
ALTER TABLE competencies_stage RENAME COLUMN tag_ids TO tags;
ALTER TABLE competencies_stage DROP COLUMN tags_old;

-- ============================================
-- Step 8: RLS policies for tags table
-- ============================================
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read tags
CREATE POLICY "Authenticated users can read tags"
  ON tags FOR SELECT
  TO authenticated
  USING (true);

-- Only committee chair can insert new tags
CREATE POLICY "Chair can create tags"
  ON tags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'committee'
      AND profiles.committee_role = 'chief_editor'
    )
  );

-- Only committee chair can delete tags
CREATE POLICY "Chair can delete tags"
  ON tags FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'committee'
      AND profiles.committee_role = 'chief_editor'
    )
  );

-- ============================================
-- Step 9: Final verification
-- ============================================
SELECT 
  c.name,
  c.tags as tag_ids,
  ARRAY(SELECT t.name FROM tags t WHERE t.id = ANY(c.tags)) as tag_names
FROM competencies c
LIMIT 3;
-- Migration 150: Unit agent instructions (one Unit = one agent, phase 1).
-- The agent's name, emoji and role are the Unit profile's; this adds the
-- owner-written instructions injected into the soul. Local only: never sent
-- to paired Units.

ALTER TABLE unit_profile
  ADD COLUMN IF NOT EXISTS instructions TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unit_profile_instructions_length') THEN
    ALTER TABLE unit_profile
      ADD CONSTRAINT unit_profile_instructions_length CHECK (instructions IS NULL OR char_length(instructions) <= 4000);
  END IF;
END $$;

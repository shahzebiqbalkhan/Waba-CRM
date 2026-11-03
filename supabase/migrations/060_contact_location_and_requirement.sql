-- Migration 060: Add location and requirement to contacts

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS requirement TEXT;

COMMENT ON COLUMN contacts.location IS 'Physical location or city of the contact';
COMMENT ON COLUMN contacts.requirement IS 'Customer requirement, project scope, or historical inquiry notes';

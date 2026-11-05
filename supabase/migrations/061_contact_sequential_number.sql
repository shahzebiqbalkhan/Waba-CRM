-- Migration 061: Add sequential contact_number scoped to account_id

-- 1. Add contact_number column
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS contact_number INTEGER;

COMMENT ON COLUMN contacts.contact_number IS 'Sequential human-readable contact number per account (1, 2, 3...)';

-- 2. Backfill existing contacts chronologically per account
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY created_at ASC, id ASC) AS seq
  FROM contacts
  WHERE account_id IS NOT NULL
)
UPDATE contacts c
SET contact_number = n.seq
FROM numbered n
WHERE c.id = n.id AND (c.contact_number IS NULL);

-- 3. Unique index per account to guarantee no duplicate IDs
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_contact_number 
ON contacts(account_id, contact_number)
WHERE account_id IS NOT NULL AND contact_number IS NOT NULL;

-- 4. Trigger function to auto-assign next contact_number on insert
CREATE OR REPLACE FUNCTION public.assign_contact_number()
RETURNS TRIGGER AS $$
DECLARE
  v_next INTEGER;
BEGIN
  IF NEW.contact_number IS NULL AND NEW.account_id IS NOT NULL THEN
    -- Transaction-level advisory lock serializes assignment per account
    PERFORM pg_advisory_xact_lock(hashtext('contact_number_lock'), hashtext(NEW.account_id::text));
    
    SELECT COALESCE(MAX(contact_number), 0) + 1
    INTO v_next
    FROM public.contacts
    WHERE account_id = NEW.account_id;

    NEW.contact_number := v_next;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_contact_number ON public.contacts;
CREATE TRIGGER trg_assign_contact_number
  BEFORE INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_contact_number();

-- 5. Update filter_contacts_by_tags to also match contact_number
CREATE OR REPLACE FUNCTION public.filter_contacts_by_tags(
  p_tag_ids UUID[],
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (contact contacts, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT DISTINCT c.id, c.created_at
    FROM contacts c
    JOIN contact_tags ct ON ct.contact_id = c.id
    WHERE ct.tag_id = ANY(p_tag_ids)
      AND (
        p_search IS NULL
        OR c.name ILIKE '%' || p_search || '%'
        OR c.phone ILIKE '%' || p_search || '%'
        OR c.email ILIKE '%' || p_search || '%'
        OR c.contact_number::TEXT ILIKE '%' || p_search || '%'
      )
  ),
  page AS (
    SELECT id, count(*) OVER() AS total_count
    FROM matched
    ORDER BY created_at DESC, id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.created_at DESC, c.id;
$$;

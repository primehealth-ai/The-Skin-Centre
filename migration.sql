UPDATE public.calls SET call_sid = exotel_call_sid WHERE call_sid IS NULL OR call_sid <> exotel_call_sid;
ALTER TABLE public.calls DROP COLUMN IF EXISTS call_sid;
ALTER TABLE public.calls RENAME COLUMN exotel_call_sid TO call_sid;
ALTER TABLE public.calls RENAME CONSTRAINT calls_exotel_call_sid_key TO calls_call_sid_key;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS agent_number text;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS call_transfer_status text;

DROP TABLE IF EXISTS public.otp_codes;

-- 3. Storage buckets setup (Private)
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('patient-photos', 'patient-photos', false),
  ('consent-signatures', 'consent-signatures', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 4. Enable RLS on storage.objects and apply policies
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated staff to read patient photos and signatures" ON storage.objects;
CREATE POLICY "Allow authenticated staff to read patient photos and signatures" 
ON storage.objects FOR SELECT 
TO authenticated 
USING (bucket_id IN ('patient-photos', 'consent-signatures'));

DROP POLICY IF EXISTS "Allow authenticated staff to upload patient photos and signatures" ON storage.objects;
CREATE POLICY "Allow authenticated staff to upload patient photos and signatures" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id IN ('patient-photos', 'consent-signatures'));

DROP POLICY IF EXISTS "Allow authenticated staff to delete patient photos and signatures" ON storage.objects;
CREATE POLICY "Allow authenticated staff to delete patient photos and signatures" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id IN ('patient-photos', 'consent-signatures'));

-- 5. Atomic webhook claiming function (Vercel Cron lock)
CREATE OR REPLACE FUNCTION public.claim_webhook_jobs(limit_count integer)
RETURNS TABLE (id uuid, payload jsonb, attempts integer) AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT w.id
    FROM public.webhook_queue w
    WHERE w.status = 'pending' AND w.attempts < 3
    ORDER BY w.created_at ASC
    LIMIT limit_count
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.webhook_queue
  SET status = 'processing', attempts = webhook_queue.attempts + 1
  WHERE webhook_queue.id IN (SELECT claimed.id FROM claimed)
  RETURNING webhook_queue.id, webhook_queue.payload, webhook_queue.attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Patient-name de-normalization cleanup (run BEFORE deploying the knowlarity
--    fix that stops writing calls.patient_name / missed_calls.patient_name).
--    Names are now read live from patients.full_name via patient_id.
--
--    NOTE: This is a corrected, FK-aware version of the originally-proposed
--    two-statement cleanup, which could not run as-is because:
--      (a) patients.phone is UNIQUE, so normalizing a dirty phone (e.g.
--          '%2b917…' or '+917…') onto an existing clean '917…' row raises a
--          unique_violation — the duplicates must be MERGED before normalizing.
--      (b) calls, missed_calls, whatsapp_messages, patient_consents and
--          patient_photos all FK-reference patients(id) with the default
--          RESTRICT, so a 'New Patient' duplicate cannot be DELETEd while any
--          child row still points at it — children must be repointed first.
--    Wrapped in a transaction; review against a backup/staging DB before prod.

BEGIN;

-- 6a. Choose one survivor per canonical phone (preferring a real, staff-edited
--     name) and map every other same-number row to it.
CREATE TEMP TABLE patient_remap ON COMMIT DROP AS
WITH norm AS (
  SELECT id, full_name,
         regexp_replace(phone, '(%2[bB]|\+)', '', 'g') AS canon_phone
  FROM public.patients
),
survivor AS (
  SELECT DISTINCT ON (canon_phone)
    canon_phone,
    id AS survivor_id
  FROM norm
  ORDER BY canon_phone,
           (full_name IS DISTINCT FROM 'New Patient') DESC,  -- keep a real name
           id                                                 -- deterministic
)
SELECT n.id AS old_id, s.survivor_id
FROM norm n
JOIN survivor s ON s.canon_phone = n.canon_phone
WHERE n.id <> s.survivor_id;

-- 6b. Repoint every child table from the loser rows to their survivor.
UPDATE public.calls            c  SET patient_id = r.survivor_id FROM patient_remap r WHERE c.patient_id  = r.old_id;
UPDATE public.missed_calls     m  SET patient_id = r.survivor_id FROM patient_remap r WHERE m.patient_id  = r.old_id;
UPDATE public.whatsapp_messages w SET patient_id = r.survivor_id FROM patient_remap r WHERE w.patient_id  = r.old_id;
UPDATE public.patient_consents pc SET patient_id = r.survivor_id FROM patient_remap r WHERE pc.patient_id = r.old_id;
UPDATE public.patient_photos   pp SET patient_id = r.survivor_id FROM patient_remap r WHERE pp.patient_id = r.old_id;

-- 6c. Delete the now-orphaned duplicate patients.
DELETE FROM public.patients p USING patient_remap r WHERE p.id = r.old_id;

-- 6d. Normalize the surviving phones to canonical 91XXXXXXXXXX (no collisions
--     remain after the merge), matching the webhook's onConflict:'phone' key.
UPDATE public.patients
SET phone = regexp_replace(phone, '(%2[bB]|\+)', '', 'g')
WHERE phone ~ '(%2[bB]|\+)';

COMMIT;

-- 1. Redundant columns cleanup & additions in calls
UPDATE public.calls SET call_sid = exotel_call_sid WHERE call_sid IS NULL OR call_sid <> exotel_call_sid;
ALTER TABLE public.calls DROP COLUMN IF EXISTS call_sid;
ALTER TABLE public.calls RENAME COLUMN exotel_call_sid TO call_sid;
ALTER TABLE public.calls RENAME CONSTRAINT calls_exotel_call_sid_key TO calls_call_sid_key;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS agent_number text;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS call_transfer_status text;

-- 2. Drop dead otp_codes table
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

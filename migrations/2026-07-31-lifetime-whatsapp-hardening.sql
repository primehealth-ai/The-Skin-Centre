-- Make the existing lifetime guard aware of messages sent before the
-- at-most-once sender was deployed. Run once in production.
BEGIN;

WITH sent_messages AS (
  SELECT
    patient_phone,
    MIN(sent_at) AS first_sent_at
  FROM public.whatsapp_messages
  WHERE direction = 'outbound'
    AND sent_by_automation = true
    AND delivery_status IS DISTINCT FROM 'failed'
  GROUP BY patient_phone
), sent_missed_calls AS (
  SELECT
    patient_phone,
    MIN(whatsapp_sent_at) AS first_sent_at
  FROM public.missed_calls
  WHERE whatsapp_sent_at IS NOT NULL
  GROUP BY patient_phone
), all_sent AS (
  SELECT patient_phone, first_sent_at FROM sent_messages
  UNION ALL
  SELECT patient_phone, first_sent_at FROM sent_missed_calls
), earliest_sent AS (
  SELECT patient_phone, MIN(first_sent_at) AS first_sent_at
  FROM all_sent
  GROUP BY patient_phone
)
UPDATE public.patients AS p
SET first_whatsapp_sent_at = e.first_sent_at
FROM earliest_sent AS e
WHERE p.phone = e.patient_phone
  AND p.first_whatsapp_sent_at IS NULL;

COMMIT;

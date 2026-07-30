-- Migration: Consent Module v2 (2026-07-30)
-- Adds consent_templates table and extends patient_consents with template-aware fields.
-- Run this against the Supabase project after deploying the new consent module code.
-- NOTE: This only ADDs columns/tables; it never modifies or drops existing ones.

-- ─── 1. consent_templates table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consent_templates (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  treatment_key text UNIQUE NOT NULL,
  description text,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  dynamic_fields jsonb NOT NULL DEFAUL '[]'::jsonb,
  has_photo_consent boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT consent_templates_pkey PRIMARY KEY (id)
);

-- Enable RLS
ALTER TABLE public.consent_templates ENABLE ROW LEVEL SECURITY;

-- Allow authenticated staff/admin read access
CREATE POLICY IF NOT EXISTS consent_templates_read_authenticated
  ON public.consent_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- ─── 2. Extend patient_consents (ADD columns only) ────────────────────────────
ALTER TABLE public.patient_consents
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS consent_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pdf_hash text,
  ADD COLUMN IF NOT EXISTS device_ip text,
  ADD COLUMN IF NOT EXISTS staff_witness_id uuid,
  ADD COLUMN IF NOT EXISTS staff_witness_name text,
  ADD COLUMN IF NOT EXISTS patient_name text,
  ADD COLUMN IF NOT EXISTS patient_age text,
  ADD COLUMN IF NOT EXISTS patient_gender text,
  ADD COLUMN IF NOT EXISTS photo_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'signed'
    CHECK (status = ANY (ARRAY['signed'::text, 'pdf_generated'::text, 'void'::text]));

-- Add foreign keys (names are explicit to match API joins)
ALTER TABLE public.patient_consents
  ADD CONSTRAINT IF NOT EXISTS patient_consents_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES public.consent_templates(id),
  ADD CONSTRAINT IF NOT EXISTS patient_consents_staff_witness_id_fkey
    FOREIGN KEY (staff_witness_id) REFERENCES public.profiles(id);

-- Backfill patient_name for existing rows from patients table
UPDATE public.patient_consents pc
SET patient_name = p.full_name,
    patient_gender = p.gender
FROM public.patients p
WHERE pc.patient_id = p.id AND pc.patient_name IS NULL;

-- RLS: status='void' should only be updatable by admin. The application enforces this
-- in the API; the DB check constraint above keeps values valid.

-- ─── 3. Storage buckets ───────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('patient-consents', 'patient-consents', false, 10485760, ARRAY['image/png','application/pdf'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('clinic-assets', 'clinic-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for patient-consents: authenticated users can read/write
CREATE POLICY IF NOT EXISTS patient_consents_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'patient-consents');

CREATE POLICY IF NOT EXISTS patient_consents_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'patient-consents');

CREATE POLICY IF NOT EXISTS patient_consents_storage_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'patient-consents')
  WITH CHECK (bucket_id = 'patient-consents');

-- Storage RLS for clinic-assets: authenticated users can read (logo is read server-side too)
CREATE POLICY IF NOT EXISTS clinic_assets_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'clinic-assets');

-- ─── 4. Seed sample consent templates (optional, edit as needed) ───────────────
-- Uncomment and customise the templates below before running, or insert via Supabase UI.

-- INSERT INTO public.consent_templates (name, treatment_key, description, sections, dynamic_fields, has_photo_consent, is_active)
-- VALUES (
--   'Chemical Peel Consent',
--   'chemical_peel',
--   'Consent for chemical peel procedures including glycolic, salicylic and TCA peels.',
--   '[
--     {"title": "Nature of Treatment", "content": "A chemical peel is a technique used to improve and smooth the texture of the skin using a chemical solution."},
--     {"title": "Risks and Side Effects", "content": "Possible side effects include redness, peeling, swelling, hyperpigmentation, hypopigmentation, infection and scarring.", "is_warning": true},
--     {"title": "Alternatives", "content": "Alternative treatments include topical retinoids, microdermabrasion and laser resurfacing."},
--     {"title": "Post-Treatment Care", "content": "Avoid sun exposure, use sunscreen, keep the area moisturised and follow all post-care instructions provided."}
--   ]'::jsonb,
--   '[
--     {"key": "peel_type", "label": "Peel Type", "type": "select", "options": ["Glycolic", "Salicylic", "TCA", "Jessner"], "required": true},
--     {"key": "concentration", "label": "Concentration %", "type": "text", "required": true},
--     {"key": "target_area", "label": "Target Area", "type": "text", "required": true},
--     {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
--   ]'::jsonb,
--   true,
--   true
-- ) ON CONFLICT (treatment_key) DO NOTHING;

-- INSERT INTO public.consent_templates (name, treatment_key, description, sections, dynamic_fields, has_photo_consent, is_active)
-- VALUES (
--   'Laser Hair Reduction Consent',
--   'laser_hair_reduction',
--   'Consent for laser hair reduction treatment.',
--   '[
--     {"title": "Nature of Treatment", "content": "Laser hair reduction uses concentrated light to target hair follicles and reduce hair growth."},
--     {"title": "Risks and Side Effects", "content": "Risks include skin irritation, pigment changes, blistering, scarring and paradoxical hair growth.", "is_warning": true},
--     {"title": "Contraindications", "content": "You must disclose pregnancy, photosensitivity, active infections, keloid tendency and recent tanning."},
--     {"title": "Aftercare", "content": "Avoid heat, sun and harsh products for 48 hours. Use sunscreen regularly."}
--   ]'::jsonb,
--   '[
--     {"key": "body_area", "label": "Body Area", "type": "text", "required": true},
--     {"key": "skin_type", "label": "Fitzpatrick Skin Type", "type": "select", "options": ["I", "II", "III", "IV", "V", "VI"], "required": true},
--     {"key": "sessions_planned", "label": "Sessions Planned", "type": "text", "required": true}
--   ]'::jsonb,
--   true,
--   true
-- ) ON CONFLICT (treatment_key) DO NOTHING;

-- ─── REMINDER ─────────────────────────────────────────────────────────────────
-- Upload The Skin Centre logo to Supabase Storage after migration:
-- Bucket: clinic-assets
-- Path: logo.jpeg

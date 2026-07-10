-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text NOT NULL,
  role text DEFAULT 'staff'::text CHECK (role = ANY (ARRAY['admin'::text, 'staff'::text])),
  phone text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.clinic_numbers (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  phone_number text NOT NULL UNIQUE,
  exophone text,
  service_name text NOT NULL,
  display_name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT clinic_numbers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.patients (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  full_name text,
  phone text NOT NULL UNIQUE,
  email text,
  gender text CHECK (gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text])),
  date_of_birth date,
  tags ARRAY,
  internal_notes text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT patients_pkey PRIMARY KEY (id)
);
CREATE TABLE public.calls (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id uuid,
  patient_phone text NOT NULL,
  patient_name text,
  call_sid text NOT NULL UNIQUE,
  incoming_number text NOT NULL,
  clinic_number_id uuid,
  service_type text,
  call_status text NOT NULL CHECK (call_status = ANY (ARRAY['answered'::text, 'missed'::text, 'in-progress'::text, 'no-answer'::text, 'busy'::text, 'failed'::text])),
  call_direction text DEFAULT 'inbound'::text CHECK (call_direction = ANY (ARRAY['inbound'::text, 'outbound'::text])),
  call_started_at timestamp with time zone NOT NULL,
  call_ended_at timestamp with time zone,
  call_duration integer,
  staff_id uuid,
  staff_name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  dial_whom_number text,
  recording_url text,
  raw_payload jsonb,
  virtual_number text,
  knowlarity_call_id text,
  agent_number text,
  call_transfer_status text,
  CONSTRAINT calls_pkey PRIMARY KEY (id),
  CONSTRAINT calls_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT calls_clinic_number_id_fkey FOREIGN KEY (clinic_number_id) REFERENCES public.clinic_numbers(id),
  CONSTRAINT calls_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.missed_calls (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  call_id uuid UNIQUE,
  patient_id uuid,
  patient_phone text NOT NULL,
  patient_name text,
  incoming_number text NOT NULL,
  service_type text,
  missed_at timestamp with time zone NOT NULL,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'whatsapp_sent'::text, 'patient_replied'::text, 'recovered'::text, 'lost'::text])),
  whatsapp_sent_at timestamp with time zone,
  whatsapp_message_id text,
  patient_replied_at timestamp with time zone,
  patient_reply_text text,
  recovered boolean DEFAULT false,
  recovered_at timestamp with time zone,
  assigned_to uuid,
  staff_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  whatsapp_attempt_count integer DEFAULT 0,
  send_after timestamp with time zone,
  followup_count integer DEFAULT 0,
  last_followup_at timestamp with time zone,
  whatsapp_session_expires_at timestamp with time zone,
  CONSTRAINT missed_calls_pkey PRIMARY KEY (id),
  CONSTRAINT missed_calls_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id),
  CONSTRAINT missed_calls_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT missed_calls_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id)
);
CREATE TABLE public.whatsapp_messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id uuid,
  patient_phone text NOT NULL,
  patient_name text,
  whatsapp_message_id text UNIQUE,
  message_text text NOT NULL,
  direction text NOT NULL CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text])),
  sent_by_staff_id uuid,
  sent_by_automation boolean DEFAULT false,
  delivery_status text CHECK (delivery_status = ANY (ARRAY['sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])),
  related_missed_call_id uuid,
  sent_at timestamp with time zone DEFAULT now(),
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_messages_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT whatsapp_messages_sent_by_staff_id_fkey FOREIGN KEY (sent_by_staff_id) REFERENCES public.profiles(id),
  CONSTRAINT whatsapp_messages_related_missed_call_id_fkey FOREIGN KEY (related_missed_call_id) REFERENCES public.missed_calls(id)
);
CREATE TABLE public.message_templates (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  category text CHECK (category = ANY (ARRAY['missed-call'::text, 'follow-up'::text, 'appointment-reminder'::text, 'custom'::text])),
  message_text text NOT NULL,
  is_active boolean DEFAULT true,
  usage_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  meta_template_name text,
  meta_template_language text DEFAULT 'en'::text,
  service_type text DEFAULT 'all'::text CHECK (service_type = ANY (ARRAY['Skin Care'::text, 'Hair Care'::text, 'General'::text, 'all'::text])),
  CONSTRAINT message_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.patient_consents (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id uuid NOT NULL,
  treatment text NOT NULL,
  consent_text text NOT NULL,
  verified_via_otp boolean DEFAULT false,
  otp_verified_at timestamp with time zone,
  signature_image_url text,
  pdf_url text,
  signed_at timestamp with time zone,
  signed_by_ip text,
  created_by_staff_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT patient_consents_pkey PRIMARY KEY (id),
  CONSTRAINT patient_consents_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT patient_consents_created_by_staff_id_fkey FOREIGN KEY (created_by_staff_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.patient_photos (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id uuid NOT NULL,
  photo_url text NOT NULL,
  photo_type text NOT NULL CHECK (photo_type = ANY (ARRAY['before'::text, 'after'::text])),
  treatment text NOT NULL,
  body_area text,
  notes text,
  taken_by_staff_id uuid,
  taken_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT patient_photos_pkey PRIMARY KEY (id),
  CONSTRAINT patient_photos_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT patient_photos_taken_by_staff_id_fkey FOREIGN KEY (taken_by_staff_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.webhook_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'pending'::text,
  attempts integer DEFAULT 0,
  error text,
  created_at timestamp with time zone DEFAULT now(),
  processed_at timestamp with time zone,
  claimed_at timestamp with time zone,
  CONSTRAINT webhook_queue_pkey PRIMARY KEY (id)
);
CREATE TABLE public.forwarding_health (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_number_id uuid UNIQUE,
  last_call_received_at timestamp with time zone,
  status text DEFAULT 'unknown'::text,
  checked_at timestamp with time zone DEFAULT now(),
  CONSTRAINT forwarding_health_pkey PRIMARY KEY (id),
  CONSTRAINT forwarding_health_clinic_number_id_fkey FOREIGN KEY (clinic_number_id) REFERENCES public.clinic_numbers(id)
);
CREATE TABLE public.error_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text,
  error_message text,
  stack text,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT error_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.opted_out_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  opted_out_at timestamp with time zone DEFAULT now(),
  opted_in_at timestamp with time zone,
  last_action text DEFAULT 'opted_out'::text,
  reason text,
  CONSTRAINT opted_out_numbers_pkey PRIMARY KEY (id)
);
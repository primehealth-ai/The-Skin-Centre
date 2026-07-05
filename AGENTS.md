# AGENT.md - PrimeHealth AI Coding Instructions

## PROJECT CONTEXT
Custom clinic intelligence system for The Skin Centre, Patna (Dr. Abhinav Kumar).
Developer: Ayush (uses Cursor AI + Claude for guidance)

---

## CRITICAL RULES

### 1. SCHEMA IS SACRED
Always reference database-schema.sql. Never rename tables/columns.

**Tables:**
- profiles
- clinic_numbers
- patients
- calls
- missed_calls
- whatsapp_messages
- message_templates
- patient_consents
- patient_photos

### 2. TECH STACK (FIXED)
- Frontend: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Backend: Next.js API Routes
- Database: Supabase (PostgreSQL + Realtime)
- Call Handling: current webhook-driven call ingestion
- WhatsApp: BSP-mediated messaging via Gupshup/Knowlarity
- Storage: Supabase Storage (photos, PDFs)
- Deploy: Vercel

### 3. CODE RULES
- TypeScript ALWAYS (.tsx/.ts)
- Tailwind ONLY (no custom CSS)
- App Router ONLY (no pages router)
- 'use client' only when needed
- Handle all errors with try/catch

---

## FOLDER STRUCTURE
```
primehealth/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Sidebar + TopBar
│   │   ├── dashboard/page.tsx  # Stats + recent calls
│   │   ├── calls/page.tsx      # All calls table
│   │   ├── missed-calls/page.tsx
│   │   ├── whatsapp/page.tsx   # 2-way chat
│   │   ├── patients/page.tsx
│   │   ├── consents/page.tsx
│   │   └── photos/page.tsx
│   └── api/
│       ├── whatsapp/webhook/route.ts
│       ├── whatsapp/send/route.ts
│       └── cron/process-missed-calls/route.ts
├── components/
│   ├── ui/          # Button, Card, Input, Modal, Badge
│   ├── dashboard/   # Sidebar, TopBar, StatCard
│   ├── calls/       # CallsTable, CallDetailModal
│   ├── missed-calls/# MissedCallsTable, MissedCallCard
│   ├── whatsapp/    # ConversationList, ChatArea, MessageBubble
│   ├── patients/    # PatientsTable, PatientDetailModal
│   ├── consents/    # ConsentForm, SignatureCanvas
│   └── photos/      # PhotoUpload, PhotoComparison
├── lib/
│   ├── supabase/client.ts
│   ├── supabase/server.ts
│   ├── whatsapp/client.ts
│   └── utils/formatters.ts
├── hooks/
│   ├── useAuth.ts
│   ├── useCalls.ts
│   ├── useMissedCalls.ts
│   └── useWhatsApp.ts
├── types/
│   ├── database.ts
│   └── api.ts
├── middleware.ts
├── vercel.json
├── .env.local
├── database-schema.sql
├── PRD.md
└── AGENT.md
```

---

## ENV VARIABLES
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
META_WHATSAPP_TOKEN=
META_PHONE_NUMBER_ID=
META_WABA_ID=
META_WEBHOOK_VERIFY_TOKEN=
```

---

## KEY WORKFLOWS

### Missed Call Flow
```
Patient calls clinic number → webhook ingestion
→ call webhook → /api/knowlarity/webhook
→ Insert into calls table
→ Trigger auto_create_missed_call (DB trigger)
→ Cron job (every 1 min) checks missed_calls
→ If pending + missed_at > 60sec ago
→ Send WhatsApp via Meta API
→ Update status = 'whatsapp_sent'
```

### WhatsApp Inbound
```
Patient replies → Meta webhook → /api/whatsapp/webhook
→ Insert into whatsapp_messages (direction: inbound)
→ Update missed_calls status = 'patient_replied'
→ Supabase Realtime → Dashboard updates
```

### Consent Flow
```
Staff creates consent → collect signature
→ signature-only consent → Generate PDF
→ Upload to Supabase Storage
→ Save in patient_consents table
```

---

## SUPABASE PATTERNS

### Client Component
```tsx
'use client'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const { data, error } = await supabase
  .from('calls')
  .select('*')
  .eq('call_status', 'missed')
  .order('created_at', { ascending: false })
```

### Server Component
```tsx
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const { data } = await supabase.from('patients').select('*')
```

### Realtime
```tsx
const channel = supabase
  .channel('missed_calls_changes')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'missed_calls' },
    (payload) => setMissedCalls(prev => [payload.new, ...prev])
  )
  .subscribe()

return () => supabase.removeChannel(channel)
```

---

## Database Schema — Current State (Last Updated: June 2026)

### Recent Migrations Applied
All changes below are LIVE in Supabase. Do not re-run these migrations.

---

### `calls` table — Added Columns
- `dial_whom_number TEXT` — Original clinic number patient dialed
- `recording_url TEXT` — Call recording URL (nullable)
- `raw_payload JSONB` — Full raw webhook dump, always populate this for debugging

### `message_templates` table — Added Columns
- `meta_template_name TEXT` — Exact Meta-approved template name e.g. `missed_call_skin_care`
- `meta_template_language TEXT DEFAULT 'en'`
- `service_type TEXT` — One of: `'Skin Care'`, `'Hair Care'`, `'General'`, `'all'`

### `missed_calls` table — Added Columns
- `whatsapp_attempt_count INTEGER DEFAULT 0` — Increments on each send attempt
- `send_after TIMESTAMPTZ` — Nullable; set this for off-hours calls (queue till 8am next day)

---

### RLS Policy — Critical
- The 3 system insert policies for `calls`, `missed_calls`, `whatsapp_messages` have been REMOVED
- Webhook handler MUST use `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never expose to client)
- All dashboard/frontend calls use anon key via Supabase Auth session

---

### Phone Number Format — Canonical Standard
- All phone numbers stored WITHOUT `+` prefix
- Format: `917XXXXXXXXX` (country code + number, no plus, no leading zero)
- Normalize all incoming numbers in webhook handler before any DB insert or lookup:
```ts
const normalize = (phone: string) =>
  phone.replace(/^\+/, '').replace(/^0/, '')
```
- `clinic_numbers.phone_number` seed data follows this format

---

### `clinic_numbers` — Seeded (Do Not Re-insert)
| phone_number  | service_name | display_name |
|---|---|---|
| 917209292888 | Skin Care | Skin Treatment Helpline |
| 917209203222 | Hair Care | Hair Treatment Helpline |
| 917209292777 | General | Skin & Hair Enquiry |

---

### Trigger: `auto_create_missed_call`
- Fires AFTER INSERT on `calls`
- Skips insert if same `patient_phone` + `incoming_number` has a `pending` missed call within last 30 mins (dedup guard)
- Copies `patient_id` from calls row (was missing in v1)

### `missed_calls` table — Additional Columns (June 2026)
- `followup_count INTEGER DEFAULT 0` — increments each time staff follows up
- `last_followup_at TIMESTAMPTZ` — timestamp of last followup action

## CALL WEBHOOK HANDLER
```ts
// /api/knowlarity/webhook/route.ts
export async function POST(req: NextRequest) {
  const body = await req.formData()
  const callSid = body.get('CallSid') as string
  const from = body.get('From') as string
  const to = body.get('To') as string
  const status = body.get('Status') as string
  const duration = body.get('Duration') as string

  const supabase = createClient()

  // Get clinic number details
  const { data: clinicNumber } = await supabase
    .from('clinic_numbers')
    .select('*')
    .eq('phone_number', to)
    .single()

  await supabase.from('calls').insert({
    call_sid: callSid,
    patient_phone: from,
    incoming_number: to,
    clinic_number_id: clinicNumber?.id,
    service_type: clinicNumber?.service_name,
    call_status: status === 'completed' ? 'answered' : 'missed',
    call_started_at: new Date().toISOString(),
    call_duration: parseInt(duration || '0')
  })

  return new Response('OK', { status: 200 })
}
```

---

## WHATSAPP SEND
```ts
// lib/whatsapp/client.ts
export async function sendWhatsAppMessage(to: string, message: string) {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace('+', ''),
        type: 'text',
        text: { body: message }
      })
    }
  )
  return response.json()
}
```

---

## DESIGN SYSTEM
```
Colors:
  Primary: #3B82F6 (blue)
  Success: #10B981 (green)
  Warning: #F59E0B (yellow)
  Error: #EF4444 (red)
  Sidebar: #0F172A (dark)
  Background: #F8FAFC (light)

Layout:
  Sidebar: 280px fixed left, dark
  TopBar: white, sticky top
  Content: #F8FAFC background
  Cards: white, rounded-xl, shadow-sm
```

---

## COMMON MISTAKES
```tsx
// ❌ WRONG
.from('call').select('phone')

// ✅ CORRECT
.from('calls').select('patient_phone')

// ❌ WRONG
status = 'completed'

// ✅ CORRECT
call_status = 'answered'

// ❌ WRONG - JS file
// ✅ CORRECT - Always .tsx/.ts
```

---

## BUILD PHASES
- Phase 1 (Week 1-2): Auth + Dashboard + Patient management
- Phase 2 (Week 3-4): call webhook + Missed call recovery + WhatsApp
- Phase 3 (Week 5-6): Consent forms + signature + Before/after photos
- Phase 4 (Week 7-8): Testing + Bug fixes + Launch


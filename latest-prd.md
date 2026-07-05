# PRD - PrimeHealth
**Client:** The Skin Centre, Patna | **Doctor:** Dr. Abhinav Kumar
**Developer:** Ayush | **Timeline:** 8 Weeks | **Status:** In Development

---

## PROBLEM
- 60-70 calls/day across 3 Airtel numbers (hair/skin/general)
- 10-15 missed calls/day = ₹3-5L/month revenue loss
- Zero follow-up on missed calls
- No digital consent management
- No before/after photo documentation

---

## SOLUTION
Custom dashboard with:
1. Automated missed call → WhatsApp recovery
2. Two-way WhatsApp chat
3. Digital consent forms (signature verified)
4. Before/after photo management
5. Patient database

---

## TECH STACK
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 + TypeScript + Tailwind |
| Backend | Next.js API Routes |
| Database | Supabase (PostgreSQL + Realtime) |
| Calls | webhook-driven call ingestion |
| WhatsApp | BSP-mediated WhatsApp via Gupshup/Knowlarity |
| Storage | Supabase Storage |
| Deploy | Vercel |

---

## CLINIC NUMBERS
| Airtel Number | Service |
|--------------|---------|
| +91XXXXXXXXXX | Hair Treatment |
| +91XXXXXXXXXX | Skin Treatment |
| +91XXXXXXXXXX | Hair + Skin (General) |
*(Update with real numbers from Dr. Abhinav)*

---

## FEATURES

### 1. Dashboard (Priority: CRITICAL)
- Real-time stats: Total calls, Missed calls, Recovered, WhatsApp sent
- Recent calls table (filterable by service/status)
- Missed calls queue
- Service-wise breakdown (Hair/Skin/General tabs)

### 2. Calls Management (Priority: CRITICAL)
- All calls table with filters
- Columns: Time, Patient Phone, Service, Status, Duration, Staff
- Filter by: Date, Service type, Status
- Auto-populated via call webhook

### 3. Missed Call Recovery (Priority: CRITICAL)
- Auto WhatsApp within 60 seconds of missed call
- Status tracking: pending → whatsapp_sent → patient_replied → recovered/lost
- Manual override option
- Recovery rate analytics

### 4. WhatsApp Chat (Priority: CRITICAL)
- Two-way messaging interface
- Conversation list (left) + Chat area (center) + Patient info (right)
- Inbound: Patient replies shown in real-time
- Outbound: Staff sends from dashboard
- Auto-message templates

### 5. Patient Management (Priority: HIGH)
- Patient directory with search
- Patient profile: calls history, WhatsApp history, consents, photos
- Auto-created when call received

### 6. Consent Management (Priority: HIGH)
- Digital consent form templates
- Touchscreen signature capture
- PDF generation + Supabase Storage
- Linked to patient record

### 7. Photo Management (Priority: HIGH)
- Before/after photo upload
- Side-by-side comparison slider
- Organized by patient + treatment
- Stored in Supabase Storage

---

## MISSED CALL WORKFLOW
```
Patient calls Airtel number
→ Forwards to clinic call webhook
→ Staff busy/unavailable
→ call webhook fires to /api/knowlarity/webhook
→ DB trigger creates missed_calls record
→ Cron job (every 1 min) checks pending records
→ If missed_at > 60 seconds ago
→ Send WhatsApp via Meta API
→ Update status = 'whatsapp_sent'
→ Patient replies → webhook → dashboard updates (realtime)
```

---

## WHATSAPP TEMPLATES
```
Missed Call:
"Hi! 👋 We missed your call at The Skin Centre.
⏰ Hours: 9AM-6PM (Mon-Sat)
🌐 Website: https://theskincentre.in
We'll contact you shortly! Reply here for help."
```

---

## DATABASE TABLES
1. profiles (staff/admin)
2. clinic_numbers (3 Airtel numbers mapped to services)
3. patients
4. calls
5. missed_calls
6. whatsapp_messages
7. message_templates
8. patient_consents
9. patient_photos

---

## PRICING
- Setup: ₹80,000 (one-time)
- Monthly: ₹18,500 (₹6,500 services + ₹12,000 maintenance)
- Payment: ₹40K start + ₹40K go-live

## MONTHLY SERVICES COST
| Service | Cost |
|---------|------|
| Meta WhatsApp API | ~₹2,000 |
| Supabase Pro | ₹1,500 |
| Vercel | ₹0 |

---

## TIMELINE
| Week | Phase | Deliverables |
|------|-------|-------------|
| 1-2 | Foundation | Auth, Dashboard UI, Patient management |
| 3-4 | Calls + WhatsApp | call webhook, missed call recovery, chat UI |
| 5-6 | Consent + Photos | signature flow, photo comparison |
| 7 | Testing | QA, bug fixes, Dr. Abhinav review |
| 8 | Launch | Deploy, staff training, go-live |

---

## PENDING (Waiting)
- [ ] Dr. Abhinav's 3 Airtel numbers
- [ ] New SIM for WhatsApp Business
- [ ] ₹40K payment from Dr. Abhinav
- [ ] Meta Business Manager access

---

## SUCCESS METRICS
- Missed call recovery rate: >70%
- WhatsApp sent within 60 seconds: 100%
- Dashboard load time: <2 seconds
- System uptime: 99.9%

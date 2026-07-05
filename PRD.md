# PrimeHealth - Product Requirements Document (PRD)

**Project:** AI-Powered Clinic Intelligence System  
**Client:** The Skin Centre, Patna — Dr. Abhinav Kumar  
**Version:** 1.0  
**Last Updated:** May 2025  
**Status:** In Development

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Product Goals](#product-goals)
4. [User Personas](#user-personas)
5. [Feature Requirements](#feature-requirements)
6. [Technical Architecture](#technical-architecture)
7. [Data Models](#data-models)
8. [UI/UX Specifications](#uiux-specifications)
9. [Integration Requirements](#integration-requirements)
10. [Success Metrics](#success-metrics)
11. [Timeline & Milestones](#timeline--milestones)

---

## Executive Summary

PrimeHealth is a custom-built AI-powered clinic management system designed exclusively for The Skin Centre in Patna. The system addresses three critical operational challenges:

1. **Zero visibility into staff call quality** — No way to know what staff says to patients
2. **Missed calls generate zero revenue** — 10-15 daily missed calls = ₹3-5L/month lost
3. **Fragmented lead management** — No centralized system for tracking patient interactions

The solution integrates:
- AI call recording & analysis (webhook-driven call pipeline + AssemblyAI + GPT-4)
- Automated WhatsApp follow-ups (WhatsApp Business API)
- Real-time dashboard (Next.js + Supabase)
- Two-way Eka Care synchronization

**Expected ROI:** ₹5L+/month additional revenue from recovered leads

---

## Problem Statement

### Current State
- **3 Airtel clinic numbers** receive 40-60 calls daily
- **10-15 missed calls daily** (when staff is busy)
- **Zero follow-up** on missed calls → patients book with competitors
- **No call recording** or quality monitoring
- **Eka Care** handles EMR, but lacks:
  - Call intelligence
  - Automated lead recovery
  - Staff performance tracking
  - WhatsApp automation

### Impact
- **₹3-5L/month revenue loss** from unrecovered leads
- **Inconsistent patient experience** (staff quality varies)
- **No data** on conversion rates, call quality, or staff performance
- **Reactive management** instead of data-driven decisions

---

## Product Goals

### Primary Goals
1. **Capture 100% of patient calls** across all 3 clinic numbers
2. **Recover 70-80% of missed calls** through automated WhatsApp follow-up
3. **Provide real-time visibility** into all clinic operations
4. **Integrate seamlessly** with existing Eka Care workflow
5. **Enable data-driven management** through AI analytics

### Success Metrics (KPIs)
| Metric | Baseline | Target (3 Months) |
|--------|----------|-------------------|
| Missed call recovery rate | 5% (manual) | 75%+ (automated) |
| Staff call visibility | 0% | 100% of calls analyzed |
| Lead response time | Hours/Days | <60 seconds |
| Appointment booking rate | Unknown | Tracked & improving |
| System uptime | N/A | 99.9% |
| Revenue from recovered leads | ₹0 | ₹4-5L/month |

---

## User Personas

### Persona 1: Dr. Abhinav Kumar (Owner / Admin)
**Role:** Clinic Owner, Primary Decision Maker  
**Needs:**
- Full visibility into clinic operations
- AI-powered insights on staff performance
- Revenue tracking and analytics
- Control over automation settings

**Pain Points:**
- No visibility into what staff says on calls
- Doesn't know how many leads are lost daily
- Can't track staff performance objectively

**Dashboard Access:** Full admin access to all features

---

### Persona 2: Clinic Manager
**Role:** Operations Supervisor  
**Needs:**
- Lead management interface
- Staff oversight tools
- Follow-up queue management
- Daily/weekly reports

**Pain Points:**
- Manual follow-up is time-consuming
- No way to prioritize leads
- Can't track which leads converted

**Dashboard Access:** Manager-level (can't change automation settings)

---

### Persona 3: Front Desk Staff
**Role:** Call Handler, Patient Coordinator  
**Needs:**
- Simple call logging
- WhatsApp chat interface
- Appointment booking
- Patient search

**Pain Points:**
- No guidance on how to handle calls
- Forget to follow up on missed calls
- Manual data entry into Eka Care

**Dashboard Access:** Staff-level (limited features)

---

### Persona 4: Patient (External User)
**Role:** Service Seeker  
**Needs:**
- Fast response to missed calls
- Easy appointment booking
- WhatsApp communication preference

**Pain Points:**
- Missed calls never followed up
- Have to call multiple times
- Prefer WhatsApp over phone calls

**Experience:** Receives automated WhatsApp, can book via link or chat

---

## Feature Requirements

### Feature 1: Dashboard / Command Center

**Priority:** CRITICAL  
**User:** All roles  
**Description:** Real-time overview of clinic operations

**Requirements:**
- FR-1.1: Display 4 stat cards with live data:
  - Total Calls Today (with trend vs yesterday)
  - Missed Calls (with recovery rate)
  - Appointments Booked (with revenue)
  - AI Flags (calls needing attention)
- FR-1.2: Show "Recent Calls" table with:
  - Time, Patient Name/Phone, Staff, Duration, AI Score, Actions
  - Click row → opens Call Detail View
- FR-1.3: Show "Missed Calls Queue" widget with:
  - Phone, Time, Follow-up status, Quick actions (Call, WhatsApp, Done)
- FR-1.4: Real-time updates (no page refresh needed)
- FR-1.5: Mobile responsive

**Acceptance Criteria:**
- Stats update within 5 seconds of new data
- Tables show latest 10 entries with pagination
- Click any row opens detail view in modal/new page
- Works on desktop, tablet, mobile

---

### Feature 2: Call Intelligence Hub

**Priority:** CRITICAL  
**User:** Admin, Manager, Doctor  
**Description:** AI-powered analysis of every patient call

**Requirements:**
- FR-2.1: Display all calls in filterable table:
  - Filters: Date range, Staff, AI score range, Flagged only
  - Search: Patient name, phone, keywords in transcript
- FR-2.2: Each call row shows:
  - Status icon (✓ good, ⚠ flagged)
  - Time, Patient, Incoming number, Staff, Duration
  - 5 AI scores (Politeness, Accuracy, Booking, Recommendation, Overall)
  - Actions (Play, View Transcript, Download)
- FR-2.3: Expandable row shows:
  - Audio waveform player with playback controls
  - Full transcript (chat-bubble style)
  - AI Analysis panel with detailed insights
  - Conversation summary
  - Flag reasons (if any)
- FR-2.4: "Live Calls" sidebar showing currently active calls
- FR-2.5: Export call data to CSV/Excel

**Acceptance Criteria:**
- All calls from the webhook pipeline appear within 5 minutes
- Transcript loads within 10 seconds of clicking
- Audio plays without buffering
- Filters work correctly (no data loss)
- AI scores are color-coded (green 8+, yellow 6-7, red <6)

---

### Feature 3: Missed Calls Recovery Queue

**Priority:** CRITICAL  
**User:** Admin, Manager, Staff  
**Description:** Kanban-style board for managing missed call follow-ups

**Requirements:**
- FR-3.1: 3-column Kanban layout:
  - Column 1: "Pending Action" (red theme)
  - Column 2: "WhatsApp Sent" (blue theme)
  - Column 3: "Recovered" (green theme)
- FR-3.2: Each card shows:
  - Patient phone (masked by default, reveal on click)
  - Time missed
  - Which clinic number was called
  - Follow-up type badge (Manual/Auto/Hybrid)
  - Quick actions
- FR-3.3: Drag-and-drop cards between columns
- FR-3.4: Bulk actions:
  - Select multiple cards
  - Send WhatsApp to all
  - Assign to staff
  - Mark as lost
- FR-3.5: "Recovery Insights" sidebar:
  - Recovery rate % (with trend)
  - Total recovered revenue this month
  - Avg response time
  - Best recovery channel (WhatsApp vs manual)
  - Peak missed call times (chart)
- FR-3.6: Top banner showing total recovered revenue

**Acceptance Criteria:**
- Missed calls appear within 15 seconds of being missed
- Drag-drop updates status in database instantly
- WhatsApp auto-sends when moved to "WhatsApp Sent" (if Auto mode)
- Bulk actions work correctly (no duplicates)
- Recovery rate calculated accurately from database

---

### Feature 4: WhatsApp Two-Way Chat

**Priority:** HIGH  
**User:** Admin, Manager, Staff  
**Description:** Full WhatsApp Business chat interface inside dashboard

**Requirements:**
- FR-4.1: 3-column layout:
  - Left: Conversation list
  - Center: Active chat
  - Right: Patient info + actions
- FR-4.2: Conversation list shows:
  - Patient avatar (auto-generated from initials)
  - Name or phone number
  - Last message preview
  - Unread badge
  - Timestamp
  - Tags (From Missed Call, Follow-up, VIP)
- FR-4.3: Chat area shows:
  - WhatsApp-style message bubbles
  - Outbound: Blue, right-aligned, PrimeHealth sender
  - Inbound: White, left-aligned, patient sender
  - Delivery status (✓✓ delivered, ✓✓ blue = read)
  - "Auto-sent 🤖" label for automated messages
  - System messages (gray, center-aligned)
- FR-4.4: Message input with:
  - Text field
  - Emoji picker
  - Quick reply templates (pills above input)
  - Send button
- FR-4.5: Right sidebar shows:
  - Patient info card (name, phone, tags, last visit)
  - "Convert to Appointment" button (BIG green)
  - "Smart Suggestions (AI)" panel:
    - Detected intent ("Patient asking about laser pricing")
    - Suggested response template
    - Suggested action
  - Conversation stats (response time, resolution time)
- FR-4.6: AI detection:
  - Highlight messages containing booking requests
  - Show "Booking request detected" banner
  - One-click convert to appointment

**Acceptance Criteria:**
- Inbound WhatsApp messages appear in <5 seconds
- Outbound messages send successfully with delivery status
- Quick reply templates load from database
- AI intent detection accuracy >80%
- "Convert to Appointment" opens booking form with patient pre-filled

---

### Feature 5: Automation & Follow-up Settings

**Priority:** HIGH  
**User:** Admin only  
**Description:** Visual workflow builder for configuring follow-up automation

**Requirements:**
- FR-5.1: Tabbed interface:
  - Tab 1: Follow-up Rules (visual workflow)
  - Tab 2: Message Templates
  - Tab 3: Scheduling & Timing
  - Tab 4: Notifications
- FR-5.2: Visual workflow builder (Tab 1):
  - Node-based interface (drag-and-drop)
  - Start node: "Missed Call Detected"
  - Decision node: "Follow-up Type?" → branches to Manual/Auto/Hybrid
  - Action nodes: "Send WhatsApp", "Add to queue", "Wait X time", "Notify staff"
  - Condition nodes: "Patient replied?", "Business hours?"
  - End nodes: "Mark as recovered", "Mark as lost"
- FR-5.3: Node configuration panel (right sidebar):
  - Click any node → shows settings
  - For "Send WhatsApp": Template selector, delay slider
  - For "Wait": Time picker (seconds to hours)
  - For "Notify staff": Staff selector
- FR-5.4: Message Templates (Tab 2):
  - Card-based layout showing all templates
  - Each card: Name, Preview, Usage count, Success rate
  - "Create New Template" button opens modal:
    - Template name
    - Message text with variable chips: {{patient_name}}, {{clinic_name}}, {{treatment}}
    - Preview panel (shows how it looks in WhatsApp)
    - Test send button
- FR-5.5: Scheduling & Timing (Tab 3):
  - Heatmap: "Response rates by hour" (when patients reply most)
  - Sliders for timing:
    - Missed call → WhatsApp (0-60 mins)
    - No reply → Follow-up #2 (1-24 hours)
    - No reply → Mark as lost (1-7 days)
  - Appointment reminder settings:
    - Toggle enable/disable
    - Timing: 1 day before / 2 hours before (checkboxes)
    - Template selector
- FR-5.6: Notifications (Tab 4):
  - Checklist with toggle switches:
    - Dashboard notifications (types)
    - WhatsApp alerts to Dr. Abhinav's phone
    - Email notifications
  - Live preview panel showing sample notification
- FR-5.7: Analytics sidebar (right):
  - Total missed calls this month
  - Recovery rate
  - Total recovered revenue
  - Avg response time
  - Link to "View Detailed Analytics"
- FR-5.8: Save button (sticky bottom):
  - "Save All Settings" → Updates automation workflows
  - "Last saved: X mins ago" timestamp

**Acceptance Criteria:**
- Workflow changes save to database correctly
- Cron jobs pick up new settings within 1 minute
- Message templates support all variables
- Test send actually sends WhatsApp
- Analytics pull from real database

---

### Feature 6: Appointments Management

**Priority:** MEDIUM  
**User:** Admin, Manager, Staff  
**Description:** Appointment calendar with Eka Care sync

**Requirements:**
- FR-6.1: Calendar view (month/week/day)
- FR-6.2: Color-coded by status:
  - Scheduled: Blue
  - Confirmed: Green
  - Completed: Gray
  - Cancelled: Red
  - No-show: Orange
- FR-6.3: Click appointment → Opens detail modal:
  - Patient info
  - Treatment
  - Staff assigned
  - Status
  - Notes
  - Actions: Reschedule, Cancel, Mark Complete
- FR-6.4: "Book New Appointment" button:
  - Opens booking form
  - Patient search/select
  - Treatment dropdown
  - Date/time picker
  - Staff assignment
  - Save → Syncs to Eka Care
- FR-6.5: Filters: Staff, Treatment, Status
- FR-6.6: Eka Care sync indicator:
  - Green checkmark if synced
  - Yellow warning if sync pending
  - Red error if sync failed

**Acceptance Criteria:**
- New appointments sync to Eka Care within 30 seconds
- Changes in Eka Care reflect in dashboard within 60 seconds
- Calendar loads <2 seconds
- No double-booking (real-time Eka Care slot check)

---

### Feature 7: Patients Directory

**Priority:** MEDIUM  
**User:** Admin, Manager, Staff  
**Description:** Searchable patient database

**Requirements:**
- FR-7.1: Table view showing all patients:
  - Name, Phone, Email, Last Visit, Total Visits, Tags
- FR-7.2: Search: Name, phone, email (fuzzy search)
- FR-7.3: Filters: VIP, New patients, Tags
- FR-7.4: Click patient → Opens detail view:
  - Full patient info
  - Visit history
  - Call history
  - WhatsApp messages
  - Appointments
  - Notes (editable)
  - Tags (editable)
- FR-7.5: "Add New Patient" button
- FR-7.6: Eka Care sync status

**Acceptance Criteria:**
- Search returns results in <1 second
- New patients from Eka Care appear within 30 seconds
- Patient data editable from dashboard → syncs to Eka Care

---

## Technical Architecture

### Tech Stack
- **Frontend:** Next.js 14 (React) + Tailwind CSS
- **Backend:** Next.js API Routes + Node.js
- **Database:** Supabase (PostgreSQL) with real-time subscriptions
- **Authentication:** Supabase Auth (multi-role)
- **File Storage:** Supabase Storage (call recordings)
- **Call Handling:** webhook-driven call ingestion
- **Transcription:** AssemblyAI (Indian English optimized)
- **AI Analysis:** OpenAI GPT-4 Turbo
- **Messaging:** WhatsApp Business API (Meta Cloud API)
- **EMR Integration:** Eka Care REST API (OAuth 2.0)
- **Scheduling:** Node.js cron jobs (for automated tasks)
- **Deployment:** Vercel (frontend + backend) with global CDN
- **Monitoring:** Vercel Analytics + Sentry (error tracking)

### System Architecture Diagram

```
┌─────────────┐
│   Patient   │
└──────┬──────┘
       │ Calls clinic
       ↓
┌─────────────────────────────────────┐
│  3 Airtel Numbers (forwarded to)   │
│       call webhook layer            │
└──────────────┬──────────────────────┘
               │
               ├─→ Call answered → webhook records
               │                   └─→ Webhook → Next.js API
               │                       └─→ Store in Supabase
               │                           └─→ AssemblyAI transcribe
               │                               └─→ GPT-4 analyze
               │                                   └─→ Display in dashboard
               │
               └─→ Missed call → webhook event
                                └─→ Create missed_call record
                                    └─→ Trigger automation workflow
                                        ├─→ Auto: Send WhatsApp (60s)
                                        ├─→ Manual: Add to queue
                                        └─→ Hybrid: WhatsApp + queue

┌─────────────────────┐
│  WhatsApp Business  │ ←──┐
│        API          │    │
└──────────┬──────────┘    │
           │               │
           │ Inbound msg   │ Outbound msg
           ↓               │
     Webhook → Next.js API ┘
                └─→ Store in whatsapp_messages table
                    └─→ Real-time update in dashboard chat

┌─────────────────────┐
│    Eka Care API     │
└──────────┬──────────┘
           │
           │ OAuth 2.0
           ↓
     Next.js API (scheduled sync every 5 mins)
     ├─→ Fetch new patients → Insert/update in Supabase
     ├─→ Fetch appointment changes → Update in Supabase
     ├─→ Push new appointments from dashboard → Eka Care
     └─→ Log all syncs in eka_care_sync_log table

┌─────────────────────────────────┐
│      Supabase Real-time         │
└──────────────┬──────────────────┘
               │
               │ Subscriptions
               ↓
     Dashboard (Next.js frontend)
     └─→ Live updates (no page refresh)
```

---

## Data Models

See `database-schema.sql` for complete schema. Key tables:

### Core Tables
- **profiles** - User accounts (admin, staff, doctor)
- **patients** - Patient directory (with Eka Care sync)
- **calls** - All call records
- **ai_call_analysis** - GPT-4 analysis results
- **missed_calls** - Missed call recovery queue
- **whatsapp_messages** - Two-way message history
- **appointments** - Appointment calendar (Eka Care sync)
- **follow_ups** - Scheduled follow-up tasks
- **message_templates** - WhatsApp message templates
- **automation_workflows** - Visual workflow configurations
- **notifications** - In-app notifications
- **eka_care_sync_log** - Sync audit trail

---

## UI/UX Specifications

### Design System
- **Color Palette:**
  - Primary: Blue (#3B82F6)
  - Success: Green (#10B981)
  - Warning: Yellow/Orange (#F59E0B)
  - Error: Red (#EF4444)
  - Neutral: Grays (#1F2937 to #F9FAFB)
- **Typography:** System fonts (Arial, Helvetica, sans-serif)
- **Components:** Tailwind CSS utility classes
- **Icons:** Lucide React icons
- **Animations:** Framer Motion (for smooth transitions)

### Layout
- **Sidebar:** Fixed left, dark theme (#0F172A), 280px width
- **Top Bar:** White, subtle shadow, search + notifications + profile
- **Main Content:** Light background (#F8FAFC), max-width container
- **Cards:** White bg, rounded corners, subtle shadow on hover
- **Tables:** Alternating row colors, hover highlight

### Responsive Breakpoints
- Mobile: <768px (stack columns, hide sidebar in drawer)
- Tablet: 768px-1024px (2-column layouts)
- Desktop: >1024px (3-column layouts, full sidebar)

---

## Integration Requirements

### Call Ingestion
- **Purpose:** Call routing, recording, missed call detection
- **Webhooks:**
  - `/api/knowlarity/webhook` - Receives call status updates
- **Data Flow:**
  - Call initiated → webhook → Create `calls` record
  - Call ends → Recording URL received → Store in Supabase Storage
  - Missed call → Create `missed_calls` record → Trigger automation

### AssemblyAI Integration
- **Purpose:** Speech-to-text transcription
- **Setup:** API key in environment variables
- **Process:**
  1. Fetch recording URL from Supabase
  2. Submit to AssemblyAI
  3. Poll for completion (webhook preferred)
  4. Store transcript in `calls.transcript_text`
- **Optimization:** Use Indian English language model

### OpenAI Integration
- **Purpose:** Call analysis, intent detection, smart suggestions
- **Setup:** API key in environment variables
- **Use Cases:**
  1. **Call Analysis:**
     - Input: Transcript
     - Output: Politeness score, accuracy score, recommendation score, summary, flags
  2. **WhatsApp Intent Detection:**
     - Input: Patient message
     - Output: Intent (booking-request, pricing-inquiry), suggested response
  3. **Smart Suggestions:**
     - Input: Conversation history
     - Output: Next best action

### WhatsApp Business API Integration
- **Purpose:** Two-way messaging, automated follow-ups
- **Setup:**
  - Register WhatsApp Business number
  - Get approval from Meta
  - Set up webhook URL
- **Webhooks:**
  - `/api/whatsapp/webhook` - Receives inbound messages
- **Message Flow:**
  - Outbound: Dashboard → Next.js API → WhatsApp API → Patient
  - Inbound: Patient → WhatsApp webhook → Next.js API → Store in DB → Real-time update
- **Templates:** Pre-approved message templates for automated sends

### Eka Care API Integration
- **Purpose:** Two-way sync of patients and appointments
- **Authentication:** OAuth 2.0 (user provides credentials)
- **Setup:**
  - Request API access from Eka Care
  - Store OAuth tokens securely
  - Implement token refresh logic
- **Sync Strategy:**
  - **Real-time (Webhooks):** If Eka Care supports webhooks, subscribe to patient/appointment changes
  - **Polling (Fallback):** Sync every 5 minutes via cron job
- **Sync Flow:**
  - **To Eka Care:** New appointment in dashboard → POST to Eka Care API → Store eka_care_appointment_id
  - **From Eka Care:** Cron job fetches patients/appointments → Insert/update in Supabase → Log in sync_log

---

## Success Metrics

### Operational Metrics
- **Call Volume:** Track total calls/day (baseline 40-60)
- **Missed Call Rate:** % of calls missed (baseline ~20%)
- **Recovery Rate:** % of missed calls recovered (target 75%)
- **Response Time:** Avg time from missed call to WhatsApp sent (target <60s)
- **Staff Performance:** Avg AI scores per staff member

### Financial Metrics
- **Revenue from Recovered Leads:** Monthly revenue from appointments booked via WhatsApp recovery (target ₹4-5L)
- **ROI:** (Revenue recovered - System cost) / System cost (target >20x)

### Quality Metrics
- **AI Analysis Accuracy:** % of AI flags validated as correct (target >90%)
- **Patient Satisfaction:** Measured via post-appointment survey (target >4.5/5)
- **System Uptime:** % of time dashboard is accessible (target 99.9%)

### Usage Metrics
- **Daily Active Users:** # of staff logging into dashboard daily
- **WhatsApp Reply Rate:** % of patients who reply to automated WhatsApp (target >30%)
- **Appointment Booking Conversion:** % of WhatsApp replies that convert to appointments (target >40%)

---

## Timeline & Milestones

### Phase 1: Foundation (Week 1-2)
- [x] Set up Next.js project structure
- [x] Configure Supabase project
- [x] Set up authentication
- [x] Build sidebar navigation
- [x] Create dashboard page shell
- [ ] Deploy to Vercel staging

### Phase 2: Dashboard & Data (Week 3)
- [ ] Build stat cards with real data
- [ ] Create Recent Calls table
- [ ] Create Missed Calls Queue widget
- [ ] Implement real-time subscriptions
- [ ] Add filters and search

### Phase 3: Call Ingestion (Week 4)
- [ ] Configure call forwarding for 3 numbers
- [ ] Implement call recording webhook
- [ ] Store recordings in Supabase Storage
- [ ] Test end-to-end call flow

### Phase 4: AI Analysis (Week 5)
- [ ] Integrate AssemblyAI
- [ ] Build transcription pipeline
- [ ] Integrate OpenAI GPT-4
- [ ] Implement call analysis logic
- [ ] Build Call Intelligence Hub UI
- [ ] Display transcripts and AI scores

### Phase 5: WhatsApp Integration (Week 6)
- [ ] Register WhatsApp Business number
- [ ] Get Meta approval
- [ ] Implement inbound webhook
- [ ] Build chat interface UI
- [ ] Implement outbound messaging
- [ ] Add quick reply templates

### Phase 6: Missed Call Recovery (Week 7)
- [ ] Build Kanban board UI
- [ ] Implement drag-and-drop
- [ ] Connect to automation workflows
- [ ] Add bulk actions
- [ ] Build recovery insights sidebar

### Phase 7: Automation Engine (Week 8)
- [ ] Build visual workflow builder
- [ ] Implement node-based editor
- [ ] Create cron job scheduler
- [ ] Build message templates UI
- [ ] Implement automation execution logic

### Phase 8: Eka Care Integration (Week 9)
- [ ] Set up OAuth with Eka Care
- [ ] Implement patient sync
- [ ] Implement appointment sync
- [ ] Add sync status indicators
- [ ] Build sync log viewer

### Phase 9: Polish & Launch (Week 10)
- [ ] QA testing (all features)
- [ ] Bug fixes
- [ ] Performance optimization
- [ ] Staff training materials
- [ ] Go-live deployment
- [ ] 1-week monitoring period

---

## Appendix

### Glossary
- **Missed Call Recovery:** Process of following up on unanswered calls via automated WhatsApp
- **AI Score:** 0-10 rating generated by GPT-4 analyzing call quality
- **Follow-up Type:** Manual (staff calls), Automated (WhatsApp auto-sends), Hybrid (both)
- **Eka Care Sync:** Two-way data synchronization between PrimeHealth and Eka Care EMR

### References
- AssemblyAI Docs: https://www.assemblyai.com/docs
- WhatsApp Business API: https://developers.facebook.com/docs/whatsapp
- Eka Care API: https://developer.eka.care
- Supabase Docs: https://supabase.com/docs

---

**Document Status:** Living document — will be updated as requirements evolve during development.

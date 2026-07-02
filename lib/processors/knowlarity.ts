import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import { sendMissedCallWhatsApp } from '@/lib/whatsapp/send'

type CallStatus = 'answered' | 'missed' | 'no-answer' | 'busy' | 'failed'

/**
 * Fix #2: normalizeCallStatus()
 * Maps Knowlarity's human-readable call_status strings to our DB enum values.
 * Falls back to 'failed' for unknown values — never crashes.
 */
function normalizeCallStatus(raw: string): CallStatus {
  switch (raw.trim()) {
    case 'Connected':  return 'answered'
    case 'Missed':     return 'missed'
    case 'No Answer':  return 'no-answer'
    case 'Busy':       return 'busy'
    case 'Failed':     return 'failed'
    // lower-case aliases (legacy / other providers)
    case 'answered':   return 'answered'
    case 'completed':  return 'answered'
    case 'missed':     return 'missed'
    case 'no-answer':  return 'no-answer'
    case 'no answer':  return 'no-answer'
    case 'no_answer':  return 'no-answer'
    case 'busy':       return 'busy'
    case 'failed':     return 'failed'
    default:           return 'failed'  // safe default — never crash
  }
}

function resolveCallStatus(payload: any): CallStatus {
  const rawStatus = String(
    payload?.call_status ??
      payload?.status ??
      payload?.callStatus ??
      payload?.disposition ??
      payload?.CallStatus ??
      ''
  ).trim()

  return normalizeCallStatus(rawStatus)
}

/**
 * Fix #5: Parse "H:MM:SS" or "MM:SS" duration string to total seconds.
 * Examples: "0:00:15" → 15, "0:01:30" → 90, "1:30" → 90
 */
function parseDuration(raw: string | null | undefined): number | null {
  if (!raw) return null
  const str = String(raw).trim()
  if (!str || str.toLowerCase() === 'none') return null
  const parts = str.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) {
    // H:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1]
  }
  // bare seconds
  return parts[0] ?? null
}

/**
 * Fix #1: Decode URL-encoded phone numbers (e.g. "%2b917290021407")
 * then strip leading + so we store as 917XXXXXXXXX format.
 */
function decodePhone(raw: string): string {
  try {
    return decodeURIComponent(raw).replace(/^\+/, '').replace(/^0/, '').trim()
  } catch {
    return raw.replace(/^\+/, '').replace(/^0/, '').trim()
  }
}

export async function processKnowlarityWebhook(payload: any): Promise<void> {
  try {
    const supabase = createServiceClient() as any
    const now = new Date()
    const nowIso = now.toISOString()

    const rawCallerPhone =
      payload?.caller_number ??
      payload?.caller_phone ??
      payload?.caller ??
      payload?.from ??
      payload?.From ??
      payload?.phone ??
      ''

    const rawVirtualNumber =
      payload?.called_number ??
      payload?.virtual_number ??
      payload?.virtualNumber ??
      payload?.to ??
      payload?.To ??
      payload?.did ??
      ''

    // Bug 1 & 2 fix (confirmed correct):
    // decodePhone() is applied to BOTH numbers here, BEFORE any lookup or storage.
    // Execution order:
    //   1. decodeURIComponent("%2b917026028964")  →  "+917026028964"
    //   2. .replace(/^\+/, '')                    →  "917026028964"
    // The + is stripped AFTER URL-decoding, so the exophone lookup receives the
    // canonical "917XXXXXXXXX" format that matches clinic_numbers.exophone exactly.
    // Both virtual_number (calls table) and incoming_number (missed_calls table)
    // are stored from this already-decoded `virtualNumber` variable — never from
    // the raw URL-encoded payload field.
    const normalizedPhone = decodePhone(String(rawCallerPhone))
    const virtualNumber   = decodePhone(String(rawVirtualNumber))

    // Lookup clinic number using the decoded exophone — matches "917XXXXXXXXX" format
    const { data: clinicNumber } = await supabase
      .from('clinic_numbers')
      .select('id, service_name')
      .eq('exophone', virtualNumber)
      .maybeSingle()

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .upsert(
        {
          phone: normalizedPhone,
          full_name: payload?.patient_name ?? payload?.caller_name ?? 'New Patient',
        },
        {
          onConflict: 'phone',
        }
      )
      .select('id, full_name, phone')
      .single()

    if (patientError || !patient) {
      throw patientError || new Error('Failed to upsert patient record')
    }

    const callStatus = resolveCallStatus(payload)
    const knowlarityCallId = payload?.knowlarity_call_id ?? payload?.call_id ?? payload?.callId ?? payload?.call_uuid ?? null

    // Item 19 fix: if all UUID sources are absent, generate a stable fallback rather
    // than storing an empty string that would UNIQUE-violate on the second empty payload.
    const rawCallSid = payload?.call_uuid ?? payload?.call_sid ?? payload?.CallSid ?? payload?.callSid ?? ''
    const callSid: string = rawCallSid.trim() !== '' ? rawCallSid.trim() : crypto.randomUUID()
    const dialWhomNumber = payload?.dial_whom_number ?? payload?.DialWhomNumber ?? null

    // Fix #6: recording_url — treat "None" / "" as null
    const rawRecordingUrl = payload?.recording_url ?? payload?.RecordingUrl ?? null
    const recordingUrl =
      !rawRecordingUrl || String(rawRecordingUrl).trim() === 'None' || String(rawRecordingUrl).trim() === ''
        ? null
        : String(rawRecordingUrl).trim()

    // Fix #5: parse H:MM:SS duration string to integer seconds
    const duration = parseDuration(payload?.caller_duration ?? null)

    // Fix #7: agent_number — treat "False" / "" as null
    const rawAgentNumber = payload?.agent_number ?? null
    const agentNumber =
      !rawAgentNumber || String(rawAgentNumber).trim() === 'False' || String(rawAgentNumber).trim() === ''
        ? null
        : String(rawAgentNumber).trim()

    const callTransferStatus = payload?.call_transfer_status ?? null

    // Fix #4: call_direction — "incoming" → "inbound", "outgoing" → "outbound"
    const rawDirection = String(payload?.call_direction ?? '').trim().toLowerCase()
    const direction: 'inbound' | 'outbound' = rawDirection === 'outgoing' ? 'outbound' : 'inbound'

    // Reconstruct actual call start time if possible (defaults to now)
    let callStartedAt = nowIso
    if (payload?.call_date && payload?.call_time) {
      try {
        const datePart = String(payload.call_date).trim()
        const timePart = String(payload.call_time).trim()
        // Assuming dates are logged in IST (+05:30)
        const parsedDate = new Date(`${datePart}T${timePart}+05:30`)
        if (!isNaN(parsedDate.getTime())) {
          callStartedAt = parsedDate.toISOString()
        }
      } catch (err) {
        console.warn('Failed to parse call_date and call_time:', err)
      }
    }

    // Critical fix items 3 & 5:
    // Use upsert on call_sid so that:
    //   a) A Knowlarity Log Push retry (same call_uuid) never throws a UNIQUE violation.
    //   b) raw_payload is always written/updated — it will be present even on a retry.
    // ignoreDuplicates: false means we DO update columns on conflict (merge latest data).
    const { data: newCall, error: callError } = await supabase
      .from('calls')
      .upsert(
        {
          patient_id: patient.id,
          patient_phone: normalizedPhone,
          clinic_number_id: clinicNumber?.id ?? null,
          service_type: clinicNumber?.service_name ?? null,
          call_status: callStatus,
          call_direction: direction,
          virtual_number: virtualNumber,
          knowlarity_call_id: knowlarityCallId,
          call_sid: callSid,
          dial_whom_number: dialWhomNumber,
          recording_url: recordingUrl,
          call_started_at: callStartedAt,
          raw_payload: payload,
          call_duration: duration,
          agent_number: agentNumber,
          call_transfer_status: callTransferStatus,
          incoming_number: virtualNumber,
          patient_name: patient.full_name ?? payload?.patient_name ?? payload?.caller_name ?? 'New Patient',
        },
        {
          onConflict: 'call_sid',
          ignoreDuplicates: false, // UPDATE existing row — merges latest raw_payload & status
        }
      )
      .select('id')
      .single()

    if (callError || !newCall) {
      throw callError || new Error('Failed to upsert call record')
    }

    // Fix #3: missed call detection — check call_transfer_status === "Missed" OR
    // normalized call_status is "missed" / "no-answer"
    const isMissedCall =
      String(callTransferStatus ?? '').trim() === 'Missed' ||
      callStatus === 'missed' ||
      callStatus === 'no-answer'

    if (!isMissedCall) {
      return
    }

    const patientName =
      patient.full_name ?? payload?.patient_name ?? payload?.caller_name ?? 'New Patient'

    // Bug 3 fix (defensive guard):
    // patient_phone MUST always come from normalizedPhone (the decoded, validated
    // variable) — never directly from a raw payload field. If normalizedPhone is
    // somehow empty (malformed payload), default to a recognisable sentinel rather
    // than storing a raw template string or undefined value.
    const safePatientPhone = normalizedPhone.trim() !== '' ? normalizedPhone : 'unknown'

    const { data: missedCall, error: missedCallError } = await supabase
      .from('missed_calls')
      .insert({
        call_id: newCall.id,
        patient_id: patient.id,
        patient_phone: safePatientPhone,
        patient_name: patientName,
        incoming_number: virtualNumber,
        service_type: clinicNumber?.service_name ?? null,
        missed_at: callStartedAt,
        status: 'pending',
        send_after: callStartedAt,
      })
      .select('id')
      .single()

    if (missedCallError || !missedCall) {
      throw missedCallError || new Error('Failed to insert missed call record')
    }

    // IST midnight boundary calculation
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    const parts = formatter.formatToParts(now)
    const yearStr = parts.find(p => p.type === 'year')?.value
    const monthStr = parts.find(p => p.type === 'month')?.value
    const dayStr = parts.find(p => p.type === 'day')?.value
    const todayMidnightUTC = new Date(`${yearStr}-${monthStr}-${dayStr}T00:00:00+05:30`)

    const serviceType = clinicNumber?.service_name ?? 'General'

    const { data: alreadySentToday, error: alreadySentError } = await supabase
      .from('missed_calls')
      .select('id')
      .eq('patient_id', patient.id)
      .not('whatsapp_sent_at', 'is', null)
      .gte('whatsapp_sent_at', todayMidnightUTC.toISOString())
      .neq('id', missedCall.id)
      .limit(1)
      .maybeSingle()

    if (alreadySentError) {
      throw alreadySentError
    }

    if (!alreadySentToday) {
      await sendMissedCallWhatsApp({
        phone: normalizedPhone,
        patientName,
        serviceType,
        missedCallId: missedCall.id,
      })
    } else {
      // If already sent today, write staff notes and skip sending
      const { error: updateError } = await supabase
        .from('missed_calls')
        .update({
          staff_notes: 'Auto-skipped: WhatsApp already sent today'
        })
        .eq('id', missedCall.id)

      if (updateError) {
        throw updateError
      }
    }
  } catch (error: unknown) {
    await logError('webhook', error, { payload })
    throw error
  }
}

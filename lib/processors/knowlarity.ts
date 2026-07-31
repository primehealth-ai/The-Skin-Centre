import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import { sendFirstContactWhatsApp, sendLocationTemplate } from '@/lib/whatsapp/send'

type CallStatus = 'answered' | 'missed'

/**
 * Knowlarity always sends call_status="Connected" regardless of outcome.
 * The real signal is agent_number + call_transfer_status:
 *   - If agent_number is present (not "False" / empty) → agent answered.
 *   - If call_transfer_status is "Missed", "Abandoned", or "Not Connected" → missed.
 *   - If no agent answered → missed.
 */
function resolveKnowlarityStatus(payload: any): {
  isMissedCall: boolean
  finalCallStatus: CallStatus
  agentNumber: string | null
  callTransferStatus: string | null
} {
  const rawAgentNumber = payload?.agent_number ?? null
  const agentAnswered =
    rawAgentNumber &&
    String(rawAgentNumber).trim() !== 'False' &&
    String(rawAgentNumber).trim() !== ''

  const callTransferStatus = payload?.call_transfer_status ?? null
  const transferStatus = String(callTransferStatus ?? '').trim()

  const isMissedCall =
    transferStatus === 'Missed' ||
    transferStatus === 'Abandoned' ||
    transferStatus === 'Not Connected' ||
    !agentAnswered

  const finalCallStatus: CallStatus = isMissedCall ? 'missed' : 'answered'

  // Normalise agent_number: store null when Knowlarity sends "False" or empty
  const agentNumber =
    agentAnswered ? decodePhone(String(rawAgentNumber)) : null

  return { isMissedCall, finalCallStatus, agentNumber, callTransferStatus }
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
  let str = String(raw).trim()
  try {
    str = decodeURIComponent(str).trim()
  } catch {
    // Ignore decode errors, fallback to manual replace
  }
  return str.replace(/^(?:%2[bB]|\+)/, '').replace(/^0/, '').trim()
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

    // Bug 1 fix: never overwrite full_name on repeat calls, and stay idempotent
    // even when an existing patient row has a dirty (encoded) phone that a plain
    // equality lookup would miss. upsert(onConflict:'phone', ignoreDuplicates:true)
    // INSERTs only when the phone is genuinely new; when the row already exists it
    // is left untouched (its staff-edited full_name is preserved) and the upsert
    // returns null. We then fetch the existing row to resolve its id.
    const { error: patientUpsertError } = await supabase
      .from('patients')
      .upsert(
        { phone: normalizedPhone, full_name: 'New Patient' },
        { onConflict: 'phone', ignoreDuplicates: true }
      )

    if (patientUpsertError) {
      throw patientUpsertError
    }

    const { data: patient, error: patientFetchError } = await supabase
      .from('patients')
      .select('id, full_name, first_whatsapp_sent_at')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    if (patientFetchError) {
      throw patientFetchError
    }

    if (!patient) {
      throw new Error(`Failed to resolve patient record for phone ${normalizedPhone}`)
    }

    // FIRST-CONTACT WHATSAPP — fire for every patient who has never received it.
    // This covers both brand-new patients and older rows with NULL first_whatsapp_sent_at.
    if (patient.first_whatsapp_sent_at === null) {
      const firstContactServiceType = clinicNumber?.service_name ?? 'General'
      try {
        const waResult = await sendFirstContactWhatsApp(
          normalizedPhone,
          firstContactServiceType,
          null, // no related_missed_call_id yet — call row not written yet at this point
        )
        console.info(
          `[knowlarity] first-contact WA for ${normalizedPhone}: sent=${waResult.sent}`,
          'reason' in waResult ? waResult.reason : `msgId=${waResult.messageId}`,
        )
      } catch (waErr) {
        console.error('[knowlarity] sendFirstContactWhatsApp threw unexpectedly:', waErr)
        await logError('whatsapp_trigger', waErr, { phone: normalizedPhone })
      }
    }

    // Resolve call status from agent_number + call_transfer_status.
    // Knowlarity always sends call_status="Connected" — that field is unreliable.
    const {
      isMissedCall,
      finalCallStatus,
      agentNumber,
      callTransferStatus,
    } = resolveKnowlarityStatus(payload)

    const knowlarityCallId = payload?.knowlarity_call_id ?? payload?.call_id ?? payload?.callId ?? payload?.call_uuid ?? null

    // Item 19 fix: if all UUID sources are absent, generate a stable fallback rather
    // than storing an empty string that would UNIQUE-violate on the second empty payload.
    const rawCallSid = payload?.call_uuid ?? payload?.call_sid ?? payload?.CallSid ?? payload?.callSid ?? ''
    const callSid: string = rawCallSid.trim() !== '' ? rawCallSid.trim() : crypto.randomUUID()
    const rawDialWhomNumber = payload?.dial_whom_number ?? payload?.DialWhomNumber ?? ''
    const dialWhomNumber = rawDialWhomNumber ? decodePhone(String(rawDialWhomNumber)) : null

    // Fix #6: recording_url — treat "None" / "" as null
    const rawRecordingUrl = payload?.recording_url ?? payload?.RecordingUrl ?? null
    const recordingUrl =
      !rawRecordingUrl || String(rawRecordingUrl).trim() === 'None' || String(rawRecordingUrl).trim() === ''
        ? null
        : String(rawRecordingUrl).trim()

    // Fix #5: parse H:MM:SS duration string to integer seconds
    const duration = parseDuration(payload?.caller_duration ?? null)

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
          call_status: finalCallStatus,
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

    // isMissedCall is already resolved above via resolveKnowlarityStatus().
    // agent_number + call_transfer_status are the authoritative signals.

    if (!isMissedCall) {
      return
    }

    // Bug 3 fix (defensive guard):
    // patient_phone MUST always come from normalizedPhone (the decoded, validated
    // variable) — never directly from a raw payload field. If normalizedPhone is
    // somehow empty (malformed payload), default to a recognisable sentinel rather
    // than storing a raw template string or undefined value.
    const safePatientPhone = normalizedPhone.trim() !== '' ? normalizedPhone : 'unknown'

    // Bug 2 fix: use upsert with ignoreDuplicates:true so that Knowlarity Log Push
    // retries (same call_id, which has a UNIQUE constraint) silently skip the
    // duplicate instead of crashing and retrying indefinitely.
    const { data: missedCall, error: missedCallError } = await supabase
      .from('missed_calls')
      .upsert(
        {
          call_id: newCall.id,
          patient_id: patient.id,
          patient_phone: safePatientPhone,
          incoming_number: virtualNumber,
          service_type: clinicNumber?.service_name ?? null,
          missed_at: callStartedAt,
          status: 'pending',
          send_after: callStartedAt,
        },
        { onConflict: 'call_id', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle()

    if (missedCallError) {
      throw missedCallError
    }

    // If missedCall is null it means the row already existed (ignoreDuplicates) —
    // a Knowlarity retry. No WhatsApp send needed; exit cleanly.
    if (!missedCall) {
      return
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
      // Look up active location template for this service type
      const { data: missedTemplate, error: missedTemplateErr } = await supabase
        .from('message_templates')
        .select('gupshup_template_id')
        .eq('service_type', serviceType)
        .eq('is_active', true)
        .not('gupshup_template_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (missedTemplateErr || !missedTemplate?.gupshup_template_id) {
        await logError('webhook', missedTemplateErr || new Error(`No active template for ${serviceType}`), {
          normalizedPhone,
          serviceType,
          step: 'missed_call_template_lookup',
        })
      } else {
        const result = await sendLocationTemplate(normalizedPhone, missedTemplate.gupshup_template_id)
        if ('messageId' in result) {
          const sentMsgId = result.messageId
          const nowSentIso = new Date().toISOString()
          const { error: updateSentError } = await supabase
            .from('missed_calls')
            .update({
              status: 'whatsapp_sent',
              whatsapp_sent_at: nowSentIso,
              whatsapp_message_id: sentMsgId,
            })
            .eq('id', missedCall.id)
          if (updateSentError) {
            throw updateSentError
          }
        } else {
          await logError('webhook', new Error('Gupshup fetch failed'), {
            normalizedPhone,
            serviceType,
            step: 'send_location_template',
          })
        }
      }
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

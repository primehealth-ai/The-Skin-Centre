import { createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/knowlarity/client'
import { logError } from '@/lib/utils/logError'
import { sendMissedCallWhatsApp } from '@/lib/whatsapp/send'

type CallStatus = 'answered' | 'missed' | 'no-answer' | 'busy' | 'failed'

function resolveCallStatus(payload: any): CallStatus {
  const rawStatus = String(
    payload?.call_status ??
      payload?.status ??
      payload?.callStatus ??
      payload?.disposition ??
      payload?.CallStatus ??
      ''
  )
    .trim()
    .toLowerCase()

  if (rawStatus === 'answered' || rawStatus === 'completed') {
    return 'answered'
  }

  if (rawStatus === 'no-answer' || rawStatus === 'no answer' || rawStatus === 'no_answer') {
    return 'no-answer'
  }

  if (rawStatus === 'busy') {
    return 'busy'
  }

  if (rawStatus === 'failed') {
    return 'failed'
  }

  return 'missed'
}

export async function processKnowlarityWebhook(payload: any): Promise<void> {
  try {
    const supabase = createServiceClient() as any
    const now = new Date()
    const nowIso = now.toISOString()

    const rawCallerPhone =
      payload?.caller_phone ??
      payload?.caller ??
      payload?.from ??
      payload?.From ??
      payload?.phone ??
      ''

    const rawVirtualNumber =
      payload?.virtual_number ??
      payload?.virtualNumber ??
      payload?.to ??
      payload?.To ??
      payload?.did ??
      ''

    const normalizedPhone = normalizePhone(String(rawCallerPhone))
    const virtualNumber = normalizePhone(String(rawVirtualNumber))

    const { data: clinicNumber } = await supabase
      .from('clinic_numbers')
      .select('id, service_name')
      .eq('phone_number', virtualNumber)
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
    const knowlarityCallId = payload?.knowlarity_call_id ?? payload?.call_id ?? payload?.callId ?? null
    const callSid = payload?.call_sid ?? payload?.CallSid ?? payload?.callSid ?? ''
    const dialWhomNumber = payload?.dial_whom_number ?? payload?.DialWhomNumber ?? null
    const recordingUrl = payload?.recording_url ?? payload?.RecordingUrl ?? null

    const { data: newCall, error: callError } = await supabase
      .from('calls')
      .insert({
        patient_id: patient.id,
        patient_phone: normalizedPhone,
        clinic_number_id: clinicNumber?.id ?? null,
        service_type: clinicNumber?.service_name ?? null,
        call_status: callStatus,
        call_direction: 'inbound',
        virtual_number: virtualNumber,
        knowlarity_call_id: knowlarityCallId,
        call_sid: callSid,
        dial_whom_number: dialWhomNumber,
        recording_url: recordingUrl,
        call_started_at: nowIso,
        raw_payload: payload,
        exotel_call_sid: callSid,
        incoming_number: virtualNumber,
        patient_name: patient.full_name ?? payload?.patient_name ?? payload?.caller_name ?? 'New Patient',
      })
      .select('id')
      .single()

    if (callError || !newCall) {
      throw callError || new Error('Failed to insert call record')
    }

    if (!['missed', 'no-answer', 'busy'].includes(callStatus)) {
      return
    }

    const patientName =
      patient.full_name ?? payload?.patient_name ?? payload?.caller_name ?? 'New Patient'

    const { data: missedCall, error: missedCallError } = await supabase
      .from('missed_calls')
      .insert({
        call_id: newCall.id,
        patient_id: patient.id,
        patient_phone: normalizedPhone,
        patient_name: patientName,
        incoming_number: virtualNumber,
        service_type: clinicNumber?.service_name ?? null,
        missed_at: nowIso,
        status: 'pending',
        send_after: nowIso,
      })
      .select('id')
      .single()

    if (missedCallError || !missedCall) {
      throw missedCallError || new Error('Failed to insert missed call record')
    }

    const todayMidnightUTC = new Date()
    todayMidnightUTC.setUTCHours(0, 0, 0, 0)

    const serviceType = clinicNumber?.service_name ?? 'General'

    const { data: alreadySentToday, error: alreadySentError } = await supabase
      .from('missed_calls')
      .select('id')
      .eq('patient_id', patient.id)
      .not('whatsapp_sent_at', 'is', null)
      .gte('whatsapp_sent_at', todayMidnightUTC.toISOString())
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
      // If already sent today, mark as sent so the cron job doesn't pick it up
      const { error: updateError } = await supabase
        .from('missed_calls')
        .update({
          status: 'whatsapp_sent',
          whatsapp_sent_at: nowIso,
          staff_notes: 'Auto-skipped WhatsApp (already sent today)'
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

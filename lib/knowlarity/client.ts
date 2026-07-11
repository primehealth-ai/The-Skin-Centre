import { createServiceClient } from '@/lib/supabase/server'

/**
 * @deprecated Do NOT use for opt-out keys or any patient-facing phone storage.
 * This lenient variant does not add the country code for 10-digit inputs, which
 * caused opt-out store/check key divergence. The single canonical normalizer is
 * `normalizePhone` in `lib/utils/phone.ts` — use that everywhere instead.
 * Retained only for the internal `getServiceType` clinic-number lookup below.
 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim()

  if (/^91\d{10}$/.test(trimmed)) {
    return trimmed
  }

  const normalized = trimmed.replace(/^\+/, '').replace(/^0/, '')
  return normalized
}

export async function getServiceType(virtualNumber: string): Promise<string> {
  const supabase = createServiceClient()
  const normalizedNumber = normalizePhone(virtualNumber)

  const { data } = await supabase
    .from('clinic_numbers')
    .select('service_name')
    .eq('phone_number', normalizedNumber)
    .maybeSingle()

  return data?.service_name || ''
}

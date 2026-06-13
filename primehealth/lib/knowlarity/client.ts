import { createServiceClient } from '@/lib/supabase/server'

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

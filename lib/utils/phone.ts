/**
 * Normalize an Indian phone number to the canonical DB format: 917XXXXXXXXX
 */
export function normalizePhone(phone: string): string | null {
  if (!phone) return null

  const cleaned = phone.replace(/[\s\-()]/g, '').trim()

  if (!cleaned) return null

  if (cleaned.startsWith('+91') && cleaned.length === 13) {
    const withCountryCode = cleaned.slice(1)
    return /^91[6-9]\d{9}$/.test(withCountryCode) ? withCountryCode : null
  }

  const digits = cleaned.replace(/^\+/, '').replace(/^0/, '')

  if (digits.length === 12 && digits.startsWith('91')) {
    return /^91[6-9]\d{9}$/.test(digits) ? digits : null
  }

  if (digits.length === 10) {
    return /^[6-9]\d{9}$/.test(digits) ? `91${digits}` : null
  }

  return null
}

/**
 * Validate an Indian phone number
 */
export function isValidIndianPhone(phone: string): boolean {
  if (!phone) return false
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) return /^[6-9]\d{9}$/.test(cleaned)
  if (cleaned.length === 12) return /^91[6-9]\d{9}$/.test(cleaned)
  return false
}

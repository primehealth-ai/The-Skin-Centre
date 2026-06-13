/**
 * Normalize an Indian phone number to +91XXXXXXXXXX format
 */
export function normalizePhone(phone: string): string {
  if (!phone) return ''
  const cleaned = phone.replace(/[\s\-()]/g, '')
  const digits = cleaned.replace(/^\+/, '')
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+91${digits}`
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`
  }
  if (cleaned.startsWith('+91') && cleaned.length === 13) {
    return cleaned
  }
  return phone // Return as-is if format is unrecognized
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

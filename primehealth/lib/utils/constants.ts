// ============================================================
// PrimeHealth — Shared Constants & Config
// ============================================================

export const CALL_STATUS_LABELS: Record<string, string> = {
  answered: 'Answered',
  missed: 'Missed',
  'in-progress': 'In Progress',
  'no-answer': 'No Answer',
  busy: 'Busy',
  failed: 'Failed',
}

export const MISSED_CALL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending Recovery',
  whatsapp_sent: 'WhatsApp Sent',
  patient_replied: 'Patient Replied',
  recovered: 'Recovered',
  lost: 'Lost',
}

export const SERVICE_TYPE_OPTIONS = [
  { value: '', label: 'All Services' },
  { value: 'Hair Care', label: 'Hair Care' },
  { value: 'Skin Care', label: 'Skin Care' },
  { value: 'General', label: 'General' },
] as const

export const CALL_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'answered', label: 'Answered' },
  { value: 'missed', label: 'Missed' },
  { value: 'no-answer', label: 'No Answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'failed', label: 'Failed' },
] as const

export const MISSED_CALL_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending Recovery' },
  { value: 'whatsapp_sent', label: 'WhatsApp Sent' },
  { value: 'patient_replied', label: 'Patient Replied' },
  { value: 'recovered', label: 'Recovered' },
  { value: 'lost', label: 'Lost' },
] as const

export const DATE_FILTER_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
] as const

export const IST_LOCALE_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
}

export const IST_DATE_ONLY_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
}

/**
 * Get today's date string in en-CA format (YYYY-MM-DD) in IST timezone
 */
export function getISTToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/**
 * Get ISO date string for start of week in IST
 */
export function getISTWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day
  const weekStart = new Date(now.setDate(diff))
  return weekStart.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/**
 * Get ISO date string for start of month in IST
 */
export function getISTMonthStart(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/**
 * Format ISO date string to IST-localised human readable
 */
export function formatIST(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('en-IN', IST_LOCALE_OPTIONS)
  } catch {
    return '—'
  }
}

/**
 * Format ISO date string to IST time only (HH:MM AM/PM)
 */
export function formatISTTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return '—'
  }
}

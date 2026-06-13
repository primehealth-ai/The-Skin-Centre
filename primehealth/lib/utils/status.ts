import type { Database } from '@/types/database'

type CallStatus = Database['public']['Tables']['calls']['Row']['call_status']
type MissedCallStatus = Database['public']['Tables']['missed_calls']['Row']['status']

export function getCallStatusVariant(status: CallStatus): 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'answered': return 'success'
    case 'missed': return 'danger'
    case 'busy': return 'warning'
    case 'no-answer': return 'warning'
    case 'failed': return 'danger'
    case 'in-progress': return 'primary'
    default: return 'secondary'
  }
}

export function getMissedCallStatusVariant(status: MissedCallStatus): 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'pending': return 'warning'
    case 'whatsapp_sent': return 'primary'
    case 'patient_replied': return 'info'
    case 'recovered': return 'success'
    case 'lost': return 'danger'
    default: return 'secondary'
  }
}

export function getCallStatusLabel(status: CallStatus): string {
  const labels: Record<CallStatus, string> = {
    'answered': 'Answered',
    'missed': 'Missed',
    'in-progress': 'In Progress',
    'no-answer': 'No Answer',
    'busy': 'Busy',
    'failed': 'Failed',
  }
  return labels[status] || status
}

export function getMissedCallStatusLabel(status: MissedCallStatus): string {
  const labels: Record<MissedCallStatus, string> = {
    'pending': 'Pending Recovery',
    'whatsapp_sent': 'WhatsApp Sent',
    'patient_replied': 'Patient Replied',
    'recovered': 'Recovered',
    'lost': 'Lost',
  }
  return labels[status] || status
}

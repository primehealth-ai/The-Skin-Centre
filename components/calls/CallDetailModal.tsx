'use client'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CallRecordingPlayer } from './CallRecordingPlayer'
import {
  Calendar,
  Clock,
  Phone,
  User,
  Activity,
  HeartHandshake,
  MessageSquare,
  FileAudio
} from 'lucide-react'
import { formatDate, formatDuration, formatPhoneNumber } from '@/lib/utils/formatters'
import { getCallStatusVariant, getCallStatusLabel } from '@/lib/utils/status'
import { Database } from '@/types/database'
import { useRouter } from 'next/navigation'

type Call = Database['public']['Tables']['calls']['Row']

interface CallDetailModalProps {
  isOpen: boolean
  onClose: () => void
  call: Call | null
}

export function CallDetailModal({ isOpen, onClose, call }: CallDetailModalProps) {
  const router = useRouter()

  if (!call) return null

  const handleStartChat = () => {
    onClose()
    router.push(`/whatsapp?phone=${encodeURIComponent(call.patient_phone)}`)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Call Details" size="md">
      <div className="flex flex-col gap-6">
        {/* Status banner */}
        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider">Call ID Reference</span>
            <span className="font-bold text-slate-700 dark:text-slate-300 text-xs truncate max-w-[200px]">
              {call.call_sid}
            </span>
          </div>
          <Badge variant={getCallStatusVariant(call.call_status)}>
            {getCallStatusLabel(call.call_status).toUpperCase()}
          </Badge>
        </div>

        {/* Detailed Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
            <User className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">Patient Name</span>
              <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                {call.patient_name || 'Anonymous Patient'}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
            <Phone className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">Patient Number</span>
              <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                {formatPhoneNumber(call.patient_phone)}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
            <Calendar className="h-5 w-5 text-emerald-500 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">Call Started At</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {formatDate(call.call_started_at)}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
            <Clock className="h-5 w-5 text-emerald-500 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">Duration</span>
              <span className="text-xs font-extrabold text-slate-750 dark:text-slate-200">
                {formatDuration(call.call_duration)}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
            <Activity className="h-5 w-5 text-amber-500 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">Service & Line</span>
              <span className="text-xs font-bold text-slate-750 dark:text-slate-200">
                {call.service_type || 'General Service'} ({formatPhoneNumber(call.incoming_number)})
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
            <HeartHandshake className="h-5 w-5 text-amber-500 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">Answered By Staff</span>
              <span className="text-xs font-bold text-slate-750 dark:text-slate-200">
                {call.staff_name || 'System / Auto-Attendant'}
              </span>
            </div>
          </div>
        </div>

        {/* Call Recording — only renders for staff/admin when a recording exists */}
        {call.recording_url && (
          <div className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
            <FileAudio className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="flex flex-col gap-2 w-full min-w-0">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">
                Call Recording
              </span>
              <CallRecordingPlayer recordingUrl={call.recording_url} variant="full" />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex gap-3 justify-end border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
          <Button variant="outline" onClick={onClose} className="font-bold text-xs py-2 px-4">
            Close
          </Button>
          <Button onClick={handleStartChat} className="flex items-center gap-1.5 font-bold text-xs py-2 px-4">
            <MessageSquare className="h-4 w-4" />
            WhatsApp Patient
          </Button>
        </div>
      </div>
    </Modal>
  )
}

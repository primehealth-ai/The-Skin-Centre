'use client'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Phone, Mail, Calendar, Tag, FileText, Heart } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/utils/formatters'
import { Database } from '@/types/database'
import { useRouter } from 'next/navigation'

type Patient = Database['public']['Tables']['patients']['Row']

interface PatientDetailModalProps {
  isOpen: boolean
  onClose: () => void
  patient: Patient | null
}

export function PatientDetailModal({ isOpen, onClose, patient }: PatientDetailModalProps) {
  const router = useRouter()

  if (!patient) return null

  const handleStartChat = () => {
    onClose()
    router.push(`/whatsapp?phone=${encodeURIComponent(patient.phone)}`)
  }

  const handleCreateConsent = () => {
    onClose()
    router.push(`/consents?patientId=${encodeURIComponent(patient.id)}`)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Patient Record Details" size="lg">
      <div className="flex flex-col gap-6">
        {/* Patient Profile Header */}
        <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-950 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
          <div className="h-14 w-14 bg-blue-600 rounded-full flex items-center justify-center font-extrabold text-white text-xl shadow-md shadow-blue-500/10">
            {patient.full_name?.charAt(0).toUpperCase() || 'P'}
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-50">
              {patient.full_name || 'Anonymous Patient'}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {patient.tags && patient.tags.length > 0 ? (
                patient.tags.map((t) => (
                  <Badge key={t} variant="primary" className="flex items-center gap-0.5 font-bold">
                    <Tag className="h-2.5 w-2.5" />
                    {t}
                  </Badge>
                ))
              ) : (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">No treatment tags</span>
              )}
            </div>
          </div>
        </div>

        {/* Detailed Info Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3 p-3.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
            <Phone className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">Phone Number</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {formatPhoneNumber(patient.phone)}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
            <Mail className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">Email Address</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                {patient.email || 'No email registered'}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
            <Calendar className="h-5 w-5 text-emerald-500 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">Date of Birth</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {patient.date_of_birth || 'Not registered'}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
            <Heart className="h-5 w-5 text-emerald-500 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">Gender Identity</span>
              <span className="text-xs font-bold capitalize text-slate-700 dark:text-slate-300">
                {patient.gender || 'Not registered'}
              </span>
            </div>
          </div>
        </div>

        {/* Clinical / Internal Notes */}
        <div className="flex items-start gap-3 p-4 bg-amber-50/20 dark:bg-slate-950/40 border border-amber-100/50 dark:border-slate-800 rounded-xl">
          <FileText className="h-5 w-5 text-amber-500 mt-0.5" />
          <div className="flex flex-col w-full">
            <span className="text-[10px] text-slate-500 dark:text-slate-450 font-extrabold uppercase tracking-wider mb-1">
              Internal Clinic Notes
            </span>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-bold leading-relaxed whitespace-pre-wrap">
              {patient.internal_notes || 'No internal clinical notes registered for this patient.'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
          <Button variant="outline" onClick={onClose} className="font-bold text-xs py-2 px-4">
            Close
          </Button>
          <Button variant="outline" onClick={handleCreateConsent} className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-900/50 dark:hover:bg-blue-950/20 font-bold text-xs py-2 px-4">
            Create Consent Form
          </Button>
          <Button onClick={handleStartChat} className="font-bold text-xs py-2 px-4">
            Open WhatsApp
          </Button>
        </div>
      </div>
    </Modal>
  )
}

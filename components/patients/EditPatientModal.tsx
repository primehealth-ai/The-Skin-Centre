'use client'
import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { AlertCircle, Lock } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/utils/formatters'
import { Database } from '@/types/database'

type Patient = Database['public']['Tables']['patients']['Row']

interface EditPatientModalProps {
  isOpen: boolean
  onClose: () => void
  patient: Patient | null
  onSuccess: (updatedPatient: Patient) => void
}

export function EditPatientModal({
  isOpen,
  onClose,
  patient,
  onSuccess,
}: EditPatientModalProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male')
  const [dob, setDob] = useState('')
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill form whenever patient changes
  useEffect(() => {
    if (patient) {
      setFullName(patient.full_name || '')
      setEmail(patient.email || '')
      setGender((patient.gender as 'male' | 'female' | 'other') || 'male')
      setDob(patient.date_of_birth || '')
      setTags(patient.tags ? patient.tags.join(', ') : '')
      setNotes(patient.internal_notes || '')
      setError(null)
    }
  }, [patient])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patient) return

    setSubmitting(true)
    setError(null)

    try {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t !== '')

      const res = await fetch(`/api/patients/${patient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim() || null,
          email: email.trim() || null,
          gender,
          date_of_birth: dob || null,
          tags: tagList.length > 0 ? tagList : null,
          internal_notes: notes.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update patient')
      }

      onSuccess(data.patient as Patient)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error updating patient')
    } finally {
      setSubmitting(false)
    }
  }

  if (!patient) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Patient Record" size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-500 text-xs font-bold rounded-xl flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Phone — read-only */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-slate-400" />
            Phone Number
            <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500 ml-0.5">(cannot be changed)</span>
          </label>
          <div className="w-full bg-slate-50 dark:bg-slate-900 text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2.5 text-slate-400 dark:text-slate-600 font-medium select-none cursor-not-allowed">
            {formatPhoneNumber(patient.phone)}
          </div>
        </div>

        <Input
          label="Full Patient Name"
          placeholder="e.g. Ayush Kumar"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <Input
          label="Email Address"
          type="email"
          placeholder="e.g. ayush@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Gender</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other')}
              className="w-full bg-white dark:bg-slate-950 text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          <Input
            label="Date of Birth"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>

        <Input
          label="Treatment Tags (comma separated)"
          placeholder="e.g. Botox, Laser, Peel"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">
            Clinical / Assessment Notes
          </label>
          <textarea
            placeholder="e.g. Sensitive skin, historical acne peels..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full bg-white dark:bg-slate-950 text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="font-bold text-xs py-2 px-4"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={submitting}
            className="font-bold text-xs py-2 px-4"
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  )
}

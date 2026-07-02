'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { PatientsTable } from '@/components/patients/PatientsTable'
import { PatientDetailModal } from '@/components/patients/PatientDetailModal'
import { EditPatientModal } from '@/components/patients/EditPatientModal'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone, isValidIndianPhone } from '@/lib/utils/phone'
import { Database } from '@/types/database'
import { AlertCircle } from 'lucide-react'

type Patient = Database['public']['Tables']['patients']['Row']

export default function PatientsPage() {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)

  // Form Fields for new patient
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male')
  const [dob, setDob] = useState('')
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadPatients = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error: fetchErr } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchErr) throw fetchErr
      setPatients(data || [])
    } catch (err: unknown) {
      console.error('Failed to query patients:', err)
      setError(err instanceof Error ? err.message : 'Failed to retrieve patients index')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadPatients()
  }, [loadPatients])

  const handleOpenAddModal = () => {
    setError(null)
    setIsAddOpen(true)
  }

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName || !phone) return

    // Validate phone number format
    const normalizedPatientPhone = normalizePhone(phone)
    if (!isValidIndianPhone(normalizedPatientPhone)) {
      setError('Invalid Indian phone number. Please enter a valid 10-digit number.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      const tagList = tags.split(',').map((t) => t.trim()).filter((t) => t !== '')
      
      const { error: insertErr } = await supabase
        .from('patients')
        .insert({
          full_name: fullName,
          phone: normalizedPatientPhone,
          email: email || null,
          gender,
          date_of_birth: dob || null,
          tags: tagList.length > 0 ? tagList : null,
          internal_notes: notes || null,
        })
        .select()
        .single()

      if (insertErr) throw insertErr

      setIsAddOpen(false)
      // Reset form fields
      setFullName('')
      setPhone('')
      setEmail('')
      setGender('male')
      setDob('')
      setTags('')
      setNotes('')
      
      // Reload the listing
      loadPatients()
    } catch (err: unknown) {
      console.error('Failed to insert patient record:', err)
      setError(err instanceof Error ? err.message : 'Failed to create patient record')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePatientUpdated = (updatedPatient: Patient) => {
    // Optimistically update in-place — no full reload needed
    setPatients((prev) =>
      prev.map((p) => (p.id === updatedPatient.id ? updatedPatient : p))
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-500 text-xs font-bold rounded-xl flex items-center gap-2">
          <AlertCircle className="h-4.5 w-4.5" />
          <span>{error}</span>
        </div>
      )}

      <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
        <Card.Header>
          <Card.Title>Patients Directory</Card.Title>
          <Card.Description>
            Search, list, and register patient details and their custom dermatological treatments.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {loading ? (
            <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500 font-medium animate-pulse">
              Retrieving patients index...
            </div>
          ) : (
            <PatientsTable
              patients={patients}
              onViewDetails={(p) => setSelectedPatient(p)}
              onEditPatient={(p) => setEditingPatient(p)}
              onAddPatient={handleOpenAddModal}
            />
          )}
        </Card.Content>
      </Card>

      {/* Patient details modal */}
      <PatientDetailModal
        isOpen={!!selectedPatient}
        onClose={() => setSelectedPatient(null)}
        patient={selectedPatient}
        onEdit={(p) => setEditingPatient(p)}
      />

      {/* Edit patient modal */}
      <EditPatientModal
        isOpen={!!editingPatient}
        onClose={() => setEditingPatient(null)}
        patient={editingPatient}
        onSuccess={handlePatientUpdated}
      />

      {/* Add patient modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Register New Patient" size="md">
        <form onSubmit={handleAddPatient} className="flex flex-col gap-4">
          <Input
            label="Full Patient Name"
            placeholder="e.g. Ayush Kumar"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />

          <Input
            label="Phone Number"
            placeholder="e.g. 9999999999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            helperText="Indian mobile number (10 digits)"
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
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">
                Gender
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other')}
                className="w-full bg-white dark:bg-slate-950 text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none"
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
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} className="font-bold text-xs py-2 px-4">
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting} className="font-bold text-xs py-2 px-4">
              Create Patient Record
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

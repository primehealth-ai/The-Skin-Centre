import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatPhoneNumber } from '@/lib/utils/formatters'

type PatientPageProps = {
  params: Promise<{
    id: string
  }>
}

export const dynamic = 'force-dynamic'

export default async function PatientDetailPage({ params }: PatientPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: patient, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !patient) {
    notFound()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-xl font-extrabold text-white">
              {patient.full_name?.charAt(0).toUpperCase() || 'P'}
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-50">
                {patient.full_name || 'New Patient'}
              </h1>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {formatPhoneNumber(patient.phone)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/patients"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Back to Patients
            </Link>
            <Link
              href={`/whatsapp?phone=${encodeURIComponent(patient.phone)}`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
            >
              Open WhatsApp
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard label="Email" value={patient.email || 'No email registered'} />
          <InfoCard label="Gender" value={patient.gender || 'Not registered'} />
          <InfoCard label="Date of Birth" value={patient.date_of_birth || 'Not registered'} />
          <InfoCard label="Created At" value={new Date(patient.created_at).toLocaleString('en-IN')} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Tags
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {patient.tags && patient.tags.length > 0 ? (
            patient.tags.map((tag: string) => (
              <span
                key={tag}
                className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
              >
                {tag}
              </span>
            ))
          ) : (
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No tags added</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Internal Notes
        </h2>
        <p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-7 text-slate-700 dark:text-slate-300">
          {patient.internal_notes || 'No internal clinical notes registered for this patient.'}
        </p>
      </div>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">{value}</p>
    </div>
  )
}

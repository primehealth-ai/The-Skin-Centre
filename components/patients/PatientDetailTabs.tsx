'use client'

import { useState } from 'react'
import { PatientConsentTab } from '@/components/consents/PatientConsentTab'
import type { PatientConsent } from '@/lib/consent/types'

interface PatientDetailTabsProps {
  patientId: string
  tags: string[] | null
  internalNotes: string | null
  consents: PatientConsent[]
}

export function PatientDetailTabs({ patientId, tags, internalNotes, consents }: PatientDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'consents'>('details')

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 mb-5">
        <button
          onClick={() => setActiveTab('details')}
          className={[
            'px-4 py-2 text-sm font-bold rounded-lg transition-all duration-200',
            activeTab === 'details'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60',
          ].join(' ')}
        >
          Details
        </button>
        <button
          onClick={() => setActiveTab('consents')}
          className={[
            'px-4 py-2 text-sm font-bold rounded-lg transition-all duration-200',
            activeTab === 'consents'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60',
          ].join(' ')}
        >
          Consents
          {consents.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[10px]">
              {consents.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'details' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tags
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {tags && tags.length > 0 ? (
                tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  No tags added
                </p>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Internal Notes
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-7 text-slate-700 dark:text-slate-300">
              {internalNotes || 'No internal clinical notes registered for this patient.'}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'consents' && (
        <PatientConsentTab consents={consents} patientId={patientId} />
      )}
    </div>
  )
}

'use client'
import { useState } from 'react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { PhoneMissed, ArrowRight, CheckCircle } from 'lucide-react'
import { formatDate, formatPhoneNumber } from '@/lib/utils/formatters'
import { getMissedCallStatusVariant, getMissedCallStatusLabel } from '@/lib/utils/status'
import { MissedCallWithPatient } from '@/types/database'
import Link from 'next/link'

type MissedCall = MissedCallWithPatient

interface MissedCallsTableProps {
  missedCalls: MissedCall[]
  onUpdateStatus: (id: string, status: MissedCall['status'], notes?: string) => Promise<void>
  /** Optional: controlled selection state passed from parent workbench */
  selectedIds?: Set<string>
  /** Optional: toggle individual row checkbox */
  onToggleSelect?: (id: string) => void
}

export function MissedCallsTable({
  missedCalls,
  onUpdateStatus,
  selectedIds,
  onToggleSelect,
}: MissedCallsTableProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'resolved' | 'all'>('pending')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Only apply internal tab-filter when the parent hasn't pre-filtered the list
  // (i.e. when selectedIds prop is NOT provided we're in standalone mode)
  const isControlled = selectedIds !== undefined

  const filtered = isControlled
    ? missedCalls // parent already filters
    : missedCalls.filter((mc) => {
        if (activeTab === 'pending') {
          return mc.status === 'pending' || mc.status === 'whatsapp_sent' || mc.status === 'patient_replied'
        } else if (activeTab === 'resolved') {
          return mc.status === 'recovered' || mc.status === 'lost'
        }
        return true
      })

  // Pagination calculations
  const totalItems = filtered.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedCalls = filtered.slice(startIndex, startIndex + itemsPerPage)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleMarkRecovered = async (id: string) => {
    try {
      setUpdatingId(id)
      await onUpdateStatus(id, 'recovered', 'Manually marked as recovered.')
    } catch (err) {
      console.error(err)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Internal tabs — only shown in standalone (uncontrolled) mode */}
      {!isControlled && (
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
          {(['pending', 'resolved', 'all'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab)
                setCurrentPage(1)
              }}
              className={`py-3 text-xs font-bold capitalize border-b-2 transition-all duration-200 ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-350'
              }`}
            >
              {tab} Queue ({missedCalls.filter((mc) => {
                if (tab === 'pending') {
                  return mc.status === 'pending' || mc.status === 'whatsapp_sent' || mc.status === 'patient_replied'
                } else if (tab === 'resolved') {
                  return mc.status === 'recovered' || mc.status === 'lost'
                }
                return true
              }).length})
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="border border-slate-800/60 rounded-xl overflow-hidden bg-slate-900/60 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-800/40 text-slate-500 font-bold border-b border-slate-800">
              <tr>
                {isControlled && (
                  <th className="px-4 py-3.5 w-10">
                    {/* Per-row checkbox column header (empty — select-all is in parent) */}
                  </th>
                )}
                <th className="px-6 py-3.5">Patient Info</th>
                <th className="px-6 py-3.5">Service Type</th>
                <th className="px-6 py-3.5">Missed At</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Patient Response</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {paginatedCalls.length === 0 ? (
                <tr>
                  <td
                    colSpan={isControlled ? 7 : 6}
                    className="px-6 py-10 text-center font-bold text-slate-500"
                  >
                    No missed calls match your filters. Good job! 🎉
                  </td>
                </tr>
              ) : (
                paginatedCalls.map((mc) => {
                  const isSelected = selectedIds?.has(mc.id) ?? false
                  const isPending = mc.status === 'pending'
                  return (
                    <tr
                      key={mc.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-blue-950/30 hover:bg-blue-950/40'
                          : 'hover:bg-slate-800/20'
                      }`}
                    >
                      {/* Checkbox */}
                      {isControlled && (
                        <td className="px-4 py-4">
                          {isPending && onToggleSelect && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => onToggleSelect(mc.id)}
                              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-600/50 cursor-pointer"
                            />
                          )}
                        </td>
                      )}

                      {/* Patient info */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="p-2 bg-rose-950/30 text-rose-500 rounded-lg shrink-0">
                            <PhoneMissed className="h-4 w-4" />
                          </span>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-100">
                              {mc.patients?.full_name || 'New Patient'}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500">
                              {formatPhoneNumber(mc.patient_phone)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Service */}
                      <td className="px-6 py-4 font-semibold text-slate-300">
                        {mc.service_type || 'General Service'}
                      </td>

                      {/* Missed at */}
                      <td className="px-6 py-4 text-slate-400 font-semibold">
                        {formatDate(mc.missed_at)}
                      </td>

                      {/* Status badge */}
                      <td className="px-6 py-4">
                        <Badge variant={getMissedCallStatusVariant(mc.status)}>
                          {getMissedCallStatusLabel(mc.status)}
                        </Badge>
                      </td>

                      {/* Patient reply */}
                      <td className="px-6 py-4 max-w-[200px] truncate italic font-semibold text-slate-400">
                        {mc.patient_reply_text ? (
                          `"${mc.patient_reply_text}"`
                        ) : (
                          <span className="text-[10px] text-slate-600 uppercase not-italic font-bold tracking-wider">
                            No reply yet
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          {mc.status !== 'recovered' && mc.status !== 'lost' && (
                            <Button
                              variant="success"
                              size="sm"
                              isLoading={updatingId === mc.id}
                              onClick={() => handleMarkRecovered(mc.id)}
                              className="flex items-center gap-1 font-bold text-xs py-1.5"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Resolve
                            </Button>
                          )}

                          <Link href={`/whatsapp?phone=${encodeURIComponent(mc.patient_phone)}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-1.5 font-bold text-xs py-1.5"
                            >
                              Open Chat
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 bg-slate-900/40">
            <span className="text-[10px] text-slate-500 font-extrabold uppercase">
              Page {currentPage} of {totalPages} ({totalItems} total entries)
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="py-1 px-3 font-bold"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="py-1 px-3 font-bold"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { PhoneIncoming, PhoneOutgoing, Eye, Search } from 'lucide-react'
import { formatDate, formatDuration, formatPhoneNumber } from '@/lib/utils/formatters'
import { getCallStatusVariant, getCallStatusLabel } from '@/lib/utils/status'
import { Database } from '@/types/database'

type Call = Database['public']['Tables']['calls']['Row']

interface CallsTableProps {
  calls: Call[]
  onViewDetails: (call: Call) => void
}

export function CallsTable({ calls, onViewDetails }: CallsTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const filteredCalls = calls.filter((call) => {
    const matchesSearch =
      call.patient_phone.includes(searchTerm) ||
      (call.patient_name && call.patient_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (call.service_type && call.service_type.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesStatus = statusFilter === 'all' || call.call_status === statusFilter

    return matchesSearch && matchesStatus
  })

  // Pagination calculations
  const totalItems = filteredCalls.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedCalls = filteredCalls.slice(startIndex, startIndex + itemsPerPage)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search patient, phone, service..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1) // Reset to first page on search
            }}
            className="w-full bg-white dark:bg-slate-950 text-xs border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-4 py-2 text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Filter Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setCurrentPage(1) // Reset to first page on filter
            }}
            className="bg-white dark:bg-slate-950 text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="all">All Calls</option>
            <option value="answered">Answered</option>
            <option value="missed">Missed</option>
            <option value="busy">Busy</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-6 py-3.5">Type</th>
                <th className="px-6 py-3.5">Patient</th>
                <th className="px-6 py-3.5">Airtel Inbound</th>
                <th className="px-6 py-3.5">Service</th>
                <th className="px-6 py-3.5">Started At</th>
                <th className="px-6 py-3.5">Duration</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
              {paginatedCalls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center font-semibold text-slate-400 dark:text-slate-500">
                    No calls match the search criteria.
                  </td>
                </tr>
              ) : (
                paginatedCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4">
                      {call.call_direction === 'inbound' ? (
                        <span className="text-blue-500 bg-blue-50 dark:bg-blue-950/30 p-1.5 rounded-lg inline-block">
                          <PhoneIncoming className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="text-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 p-1.5 rounded-lg inline-block">
                          <PhoneOutgoing className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          {call.patient_name || 'New Patient'}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                          {formatPhoneNumber(call.patient_phone)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">
                      {formatPhoneNumber(call.incoming_number)}
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {call.service_type || 'General'}
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-semibold">
                      {formatDate(call.call_started_at)}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-600 dark:text-slate-350">
                      {formatDuration(call.call_duration)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={getCallStatusVariant(call.call_status)}>
                        {getCallStatusLabel(call.call_status)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewDetails(call)}
                        className="inline-flex items-center gap-1.5 py-1.5 font-bold"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/40">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">
              Page {currentPage} of {totalPages} ({totalItems} total calls)
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

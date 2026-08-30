'use client'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { CallRecordingPlayer } from './CallRecordingPlayer'
import { PhoneIncoming, PhoneOutgoing, Eye } from 'lucide-react'
import { formatDate, formatDuration, formatPhoneNumber } from '@/lib/utils/formatters'
import { getCallStatusVariant, getCallStatusLabel } from '@/lib/utils/status'
import { CallWithPatient } from '@/types/database'

type Call = CallWithPatient

interface CallsTableProps {
  calls: Call[]
  onViewDetails: (call: Call) => void
}

export function CallsTable({ calls, onViewDetails }: CallsTableProps) {
  return (
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
              <th className="px-6 py-3.5">Recording</th>
              <th className="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
            {calls.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-10 text-center font-semibold text-slate-400 dark:text-slate-500">
                  No calls match the selected filters.
                </td>
              </tr>
            ) : (
              calls.map((call) => (
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
                        {call.patients?.full_name || 'New Patient'}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
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
                  <td className="px-6 py-4">
                    <CallRecordingPlayer recordingUrl={call.recording_url} variant="compact" />
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
    </div>
  )
}

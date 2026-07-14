'use client'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { PhoneMissed, ArrowUpRight, Check } from 'lucide-react'
import { formatDate, formatPhoneNumber } from '@/lib/utils/formatters'
import { getMissedCallStatusVariant, getMissedCallStatusLabel } from '@/lib/utils/status'
import { MissedCallWithPatient } from '@/types/database'
import Link from 'next/link'

type MissedCall = MissedCallWithPatient

interface MissedCallCardProps {
  missedCall: MissedCall
  onResolve?: (id: string) => Promise<void>
}

export function MissedCallCard({ missedCall, onResolve }: MissedCallCardProps) {
  return (
    <Card hoverable className="border-l-4 border-l-rose-500 flex flex-col gap-4 relative bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-rose-50 dark:bg-rose-950/20 text-rose-500 rounded-lg">
            <PhoneMissed className="h-4 w-4" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              {missedCall.patients?.full_name || 'New Patient'}
            </h4>
            <span className="text-sm font-medium text-gray-200">
              {formatPhoneNumber(missedCall.patient_phone)}
            </span>
          </div>
        </div>
        <Badge variant={getMissedCallStatusVariant(missedCall.status)}>
          {getMissedCallStatusLabel(missedCall.status)}
        </Badge>
      </div>

      <div className="flex flex-col gap-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-400 font-semibold">Service Inquiry:</span>
          <span className="font-bold text-slate-700 dark:text-slate-350">
            {missedCall.service_type || 'General'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400 font-semibold">Missed At:</span>
          <span className="text-slate-500 font-semibold dark:text-slate-400">
            {formatDate(missedCall.missed_at)}
          </span>
        </div>
      </div>

      {missedCall.patient_reply_text && (
        <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-100 dark:border-slate-800 text-[11px] italic text-slate-500 dark:text-slate-400 font-medium">
          "{missedCall.patient_reply_text}"
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-150 dark:border-slate-800 pt-3 mt-1">
        {onResolve && missedCall.status !== 'recovered' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onResolve(missedCall.id)}
            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 flex items-center gap-1 font-bold text-xs"
          >
            <Check className="h-3.5 w-3.5" />
            Resolve
          </Button>
        )}
        <Link href={`/whatsapp?phone=${encodeURIComponent(missedCall.patient_phone)}`} className="inline-block">
          <Button size="sm" className="flex items-center gap-1 font-bold text-xs py-1.5">
            Open Chat
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </Card>
  )
}

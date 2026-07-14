'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'
import Link from 'next/link'
import { PhoneIncoming, CheckCircle2, ArrowRight } from 'lucide-react'

interface MissedCallRow {
  id: string
  patients: { full_name: string | null } | null
  patient_phone: string
  service_type: string | null
  missed_at: string
  status: string
}

interface LiveRecentMissedQueueProps {
  initialRows: MissedCallRow[]
}

export default function LiveRecentMissedQueue({ initialRows }: LiveRecentMissedQueueProps) {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [rows, setRows] = useState<MissedCallRow[]>(initialRows)

  // Fix 3: wrapped in useCallback with correct deps so the Realtime handler always
  // uses the current supabase reference, not a stale first-render copy.
  const refetchQueue = useCallback(async () => {
    const { data } = await supabase
      .from('missed_calls')
      .select('id, patient_phone, service_type, missed_at, status, patients(full_name)')
      .eq('status', 'pending')
      .order('missed_at', { ascending: false })
      .limit(5)
    if (data) setRows(data as MissedCallRow[])
  }, [supabase])

  useEffect(() => {
    async function setup() {
      // Fix 1: Deduplicate channel on singleton — remove any existing slot before
      // subscribing, preventing channel exhaustion across page navigations.
      const existing = supabase.getChannels().find((c: RealtimeChannel) => c.topic === 'realtime:live-recent-missed-queue')
      if (existing) await supabase.removeChannel(existing)

      channel = supabase
        .channel('live-recent-missed-queue')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'missed_calls' }, refetchQueue)
        .subscribe()
    }

    let channel: ReturnType<typeof supabase.channel> | undefined
    setup()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [refetchQueue])

  return (
    <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
      {rows.length === 0 ? (
        <div className="px-5 py-12 text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-3">
            <CheckCircle2 size={24} className="text-emerald-500" />
          </div>
          <p className="text-sm font-extrabold text-slate-600 dark:text-slate-300">All Clear!</p>
          <p className="text-xs font-bold text-slate-400 mt-1">No pending missed calls right now.</p>
        </div>
      ) : (
        rows.map((call) => (
          <div key={call.id} className="px-5 py-4 flex items-center justify-between hover:bg-rose-50/20 dark:hover:bg-rose-950/10 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center shrink-0 border border-rose-100 dark:border-rose-900/30">
                <PhoneIncoming size={16} className="text-rose-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">
                  {call.patients?.full_name || call.patient_phone}
                </p>
                <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 mt-0.5 flex gap-2">
                  <span>{call.service_type || 'General'}</span>
                  <span>&bull;</span>
                  <span suppressHydrationWarning>{new Date(call.missed_at).toLocaleString()}</span>
                </p>
              </div>
            </div>
            <Link
              href={`/whatsapp?phone=${encodeURIComponent(call.patient_phone)}`}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
            >
              Message <ArrowRight size={12} />
            </Link>
          </div>
        ))
      )}
    </div>
  )
}

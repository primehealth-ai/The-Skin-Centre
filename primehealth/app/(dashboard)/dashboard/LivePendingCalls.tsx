'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import StatCard from '@/components/dashboard/StatCard'
import { PhoneMissed } from 'lucide-react'

export default function LivePendingCalls({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount)
  const supabase = createClient()

  useEffect(() => {
    // We only care about missed calls that change to 'pending' or change out of 'pending'
    // or new inserts that are 'pending'. 
    // Easiest is to listen to all changes on missed_calls and conditionally update.
    // Wait, the safest way without a complex reducer is just to listen to INSERT/UPDATE/DELETE
    // and ideally fetch the real count. But we can approximate by:
    // INSERT: if status === 'pending', count++
    // UPDATE: if old status was 'pending' and new is not, count--. If old wasn't and new is, count++
    // DELETE: if status === 'pending', count--
    const channel = supabase
      .channel('live-pending-calls')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'missed_calls' },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            if (payload.new.status === 'pending') setCount(c => c + 1)
          } else if (payload.eventType === 'UPDATE') {
            const wasPending = payload.old.status === 'pending'
            const isPending = payload.new.status === 'pending'
            if (wasPending && !isPending) setCount(c => Math.max(0, c - 1))
            if (!wasPending && isPending) setCount(c => c + 1)
          } else if (payload.eventType === 'DELETE') {
            if (payload.old.status === 'pending') setCount(c => Math.max(0, c - 1))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <StatCard
      title="Live Pending Recoveries"
      value={count}
      icon={PhoneMissed}
      color="red"
      trend={count > 0 ? "Urgent Action Required" : "All Caught Up"}
      trendUp={count === 0}
    />
  )
}

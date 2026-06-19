'use client'
import { Menu, Bell, Search, User } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient as createBrowserClient } from '@/lib/supabase/client'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard Overview',
  '/calls': 'All Inbound Calls',
  '/missed-calls': 'Missed Calls Recovery Queue',
  '/whatsapp': 'WhatsApp Two-Way Chat',
  '/patients': 'Patient Directory',
  '/consents': 'Digital Consent Forms',
  '/photos': 'Before / After Photos',
}

interface ForwardingHealth {
  id: string
  status: string | null
  last_call_received_at: string | null
  clinic_numbers: {
    service_name: string
  } | null
}

export default function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname()
  const { profile } = useAuth()
  const supabaseRef = useRef(createBrowserClient())
  const supabase = supabaseRef.current
  const [forwardingHealth, setForwardingHealth] = useState<ForwardingHealth[]>([])

  useEffect(() => {
    async function fetchForwardingHealth() {
      const { data, error } = await supabase
        .from('forwarding_health')
        .select(`
          id,
          status,
          last_call_received_at,
          clinic_numbers (
            service_name
          )
        `)
        .order('checked_at', { ascending: false })

      if (error) {
        console.error('Failed to load forwarding health:', error.message)
        return
      }

      setForwardingHealth((data ?? []).slice(0, 3) as ForwardingHealth[])
    }

    fetchForwardingHealth()

    const channel = supabase
      .channel('forwarding_health_topbar')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'forwarding_health',
        },
        () => {
          fetchForwardingHealth()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  const getHoursAgo = (lastCallReceivedAt: string | null) => {
    if (!lastCallReceivedAt) return 9999

    const timestamp = new Date(lastCallReceivedAt).getTime()
    if (Number.isNaN(timestamp)) return 9999

    return Math.max(0, Math.floor((Date.now() - timestamp) / (60 * 60 * 1000)))
  }

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between px-4 sm:px-6 shrink-0 transition-colors duration-150">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Toggle navigation menu"
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <Menu size={18} className="text-slate-600 dark:text-slate-350" />
        </button>
        <h2 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm tracking-tight sm:text-base">
          {pageTitles[pathname] || 'PrimeHealth'}
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {/* Call Forwarding Health */}
        <div className="hidden lg:flex items-center gap-1.5">
          {forwardingHealth.map((health) => {
            const isHealthy = health.status === 'healthy'
            const hoursAgo = getHoursAgo(health.last_call_received_at)

            return (
              <div
                key={health.id}
                title={`Last call: ${hoursAgo} hours ago`}
                className="flex max-w-32 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    isHealthy ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
                <span className="truncate">
                  {health.clinic_numbers?.service_name || 'Unknown'}
                </span>
              </div>
            )
          })}
        </div>

        {/* Search */}
        <div className="hidden sm:flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all">
          <Search size={14} className="text-slate-400" />
          <input
            type="text"
            placeholder="Quick search patients..."
            className="bg-transparent text-xs outline-none text-slate-700 dark:text-slate-300 w-40 md:w-52 placeholder:text-slate-400 font-semibold"
          />
        </div>

        {/* Notifications */}
        <button 
          aria-label="View notifications"
          className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <Bell size={18} className="text-slate-600 dark:text-slate-350" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border border-white dark:border-slate-900" />
        </button>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />

        {/* Dynamic User Profile Badge */}
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-100/50 dark:border-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <User size={16} />
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-150 leading-tight">
              {profile?.full_name || 'Clinic Staff'}
            </span>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {profile?.role || 'operator'}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}

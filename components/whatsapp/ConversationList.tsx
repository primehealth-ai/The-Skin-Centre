'use client'
import { useState } from 'react'
import { Search, User, RefreshCw } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/utils/formatters'

interface Conversation {
  patient_phone: string
  patient_name: string | null
  last_message?: string
  last_message_at?: string
  unreadCount?: number
  hasPendingMissedCall?: boolean
}

type TabFilter = 'all' | 'unread' | 'new'

interface ConversationListProps {
  conversations: Conversation[]
  activePhone: string | null
  onSelect: (phone: string) => void
  loading?: boolean
  onRefresh?: () => void
}

function relativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diffMs / 60_000)
  const hours = Math.floor(diffMs / 3_600_000)
  const days = Math.floor(diffMs / 86_400_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const TABS: { value: TabFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'new', label: 'New Patient' },
]

export function ConversationList({
  conversations,
  activePhone,
  onSelect,
  loading = false,
  onRefresh,
}: ConversationListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<TabFilter>('all')

  const filtered = conversations.filter((c) => {
    const term = searchTerm.toLowerCase()
    const matchSearch =
      c.patient_phone.includes(term) ||
      (c.patient_name && c.patient_name.toLowerCase().includes(term))

    if (!matchSearch) return false
    if (activeTab === 'unread') return (c.unreadCount ?? 0) > 0
    if (activeTab === 'new') return !c.patient_name
    return true
  })

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Header with search + refresh */}
      <div className="px-4 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 text-xs border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-4 py-2 text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              aria-label="Refresh conversations"
              className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-3 py-1 rounded-md text-[10px] font-bold transition-colors focus:outline-none ${
                activeTab === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
              {tab.value === 'unread' && conversations.some((c) => (c.unreadCount ?? 0) > 0) && (
                <span className="ml-1 inline-flex items-center justify-center h-3.5 min-w-[14px] px-0.5 bg-rose-500 text-white rounded-full text-[8px] font-bold">
                  {conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
        {loading ? (
          // Loading skeleton
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 p-4 animate-pulse">
              <div className="h-10 w-10 bg-slate-200 dark:bg-slate-800 rounded-full flex-shrink-0" />
              <div className="flex-1 flex flex-col gap-2 pt-0.5">
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded w-3/4 mt-1" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
            {searchTerm ? 'No conversations match your search.' : 'No conversations yet.'}
          </div>
        ) : (
          filtered.map((convo) => {
            const isActive = activePhone === convo.patient_phone
            return (
              <button
                key={convo.patient_phone}
                onClick={() => onSelect(convo.patient_phone)}
                className={`w-full flex items-start gap-3 p-4 transition-colors text-left relative focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-inset ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-600 rounded-r" />
                )}

                {/* Avatar with pending missed call dot */}
                <div className="relative flex-shrink-0">
                  <div className="h-10 w-10 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center">
                    <User className="h-5 w-5" />
                  </div>
                  {convo.hasPendingMissedCall && (
                    <span
                      title="Has pending missed call"
                      className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-orange-500 border-2 border-white dark:border-slate-900 rounded-full"
                    />
                  )}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`font-bold text-sm truncate ${
                      isActive
                        ? 'text-blue-700 dark:text-blue-400'
                        : 'text-slate-800 dark:text-slate-100'
                    }`}>
                      {convo.patient_name || 'New Patient'}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {(convo.unreadCount ?? 0) > 0 && (
                        <span className="h-5 min-w-[20px] px-1 bg-rose-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                          {convo.unreadCount}
                        </span>
                      )}
                      {convo.last_message_at && (
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold whitespace-nowrap">
                          {relativeTime(convo.last_message_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold leading-none">
                    {formatPhoneNumber(convo.patient_phone)}
                  </span>

                  {convo.last_message && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1 font-medium leading-tight">
                      {convo.last_message}
                    </p>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

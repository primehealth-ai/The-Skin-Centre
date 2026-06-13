'use client'
import { useState } from 'react'
import { Search, User } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/utils/formatters'

interface Conversation {
  patient_phone: string
  patient_name: string | null
  last_message?: string
  last_message_at?: string
  unreadCount?: number
}

interface ConversationListProps {
  conversations: Conversation[]
  activePhone: string | null
  onSelect: (phone: string) => void
}

export function ConversationList({
  conversations,
  activePhone,
  onSelect,
}: ConversationListProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = conversations.filter((c) => {
    const term = searchTerm.toLowerCase()
    return (
      c.patient_phone.includes(term) ||
      (c.patient_name && c.patient_name.toLowerCase().includes(term))
    )
  })

  return (
    <div className="flex flex-col h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 w-[320px] flex-shrink-0">
      {/* Search Thread */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950 text-xs border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-4 py-2 text-slate-700 dark:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
            No conversations found.
          </div>
        ) : (
          filtered.map((convo) => {
            const isActive = activePhone === convo.patient_phone
            return (
              <button
                key={convo.patient_phone}
                onClick={() => onSelect(convo.patient_phone)}
                className={`w-full flex items-start gap-3 p-4 transition-colors text-left relative focus:outline-none ${
                  isActive
                    ? 'bg-blue-50/50 dark:bg-blue-950/20'
                    : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/20'
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />
                )}

                {/* Avatar */}
                <div className="h-10 w-10 bg-slate-155 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5" />
                </div>

                {/* Body details */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">
                      {convo.patient_name || 'New Patient'}
                    </span>
                    {convo.last_message_at && (
                      <span className="text-[9px] text-slate-450 dark:text-slate-500 font-semibold whitespace-nowrap">
                        {new Date(convo.last_message_at).toLocaleTimeString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-none">
                    {formatPhoneNumber(convo.patient_phone)}
                  </span>
                  {convo.last_message && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1.5 font-medium leading-tight">
                      {convo.last_message}
                    </p>
                  )}
                </div>

                {/* Unread dot */}
                {convo.unreadCount && convo.unreadCount > 0 ? (
                  <span className="h-5 min-w-[20px] px-1 bg-blue-600 rounded-full text-[9px] font-bold text-white flex items-center justify-center flex-shrink-0">
                    {convo.unreadCount}
                  </span>
                ) : null}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

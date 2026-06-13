import { Check, CheckCheck, Clock, ShieldAlert } from 'lucide-react'
import { Database } from '@/types/database'

type Message = Database['public']['Tables']['whatsapp_messages']['Row']

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isInbound = message.direction === 'inbound'

  const getStatusIcon = (status: Message['delivery_status']) => {
    switch (status) {
      case 'sent':
        return <Check className="h-3.5 w-3.5 text-slate-400" />
      case 'delivered':
        return <CheckCheck className="h-3.5 w-3.5 text-slate-400" />
      case 'read':
        return <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
      case 'failed':
        return <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
      default:
        return <Clock className="h-3 w-3 text-slate-300 animate-pulse" />
    }
  }

  return (
    <div className={`flex w-full ${isInbound ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[70%] flex flex-col gap-1 rounded-2xl px-4 py-2.5 shadow-sm border ${
          isInbound
            ? 'bg-white border-slate-200 text-slate-800 rounded-tl-none dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100'
            : 'bg-blue-600 border-blue-500 text-white rounded-tr-none shadow-md shadow-blue-500/5 dark:bg-blue-600 dark:border-blue-700'
        }`}
      >
        {/* Automation Tag */}
        {message.sent_by_automation && (
          <span className="text-[8px] tracking-wider font-extrabold uppercase bg-white/20 text-white/90 border border-white/15 px-1.5 py-0.5 rounded w-max select-none mb-1">
            🤖 Auto-Recovery
          </span>
        )}

        {/* Message Body */}
        <p className="text-xs font-medium whitespace-pre-wrap leading-relaxed">
          {message.message_text}
        </p>

        {/* Time + Receipt Status */}
        <div className="flex items-center gap-1.5 justify-end self-end mt-1 text-[9px] font-bold select-none opacity-80">
          <span>
            {new Date(message.sent_at).toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })}
          </span>
          {!isInbound && getStatusIcon(message.delivery_status)}
        </div>
      </div>
    </div>
  )
}

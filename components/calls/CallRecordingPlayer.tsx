'use client'
import { Download } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

interface CallRecordingPlayerProps {
  /** Direct, publicly accessible recording URL. When null/empty the component renders nothing. */
  recordingUrl: string | null | undefined
  /**
   * Visual density.
   * - 'compact': minimal controls height for inline use inside dense table rows.
   * - 'full': standard size for use inside the detail modal.
   */
  variant?: 'compact' | 'full'
}

/**
 * Inline HTML5 audio player + download link for a call recording.
 *
 * Visibility rules:
 * 1. Only renders for staff/admin roles (same pattern as PhotoComparison).
 * 2. Renders nothing if recordingUrl is null/empty (no broken player).
 */
export function CallRecordingPlayer({ recordingUrl, variant = 'full' }: CallRecordingPlayerProps) {
  const { profile } = useAuth()
  const isStaffOrAdmin = profile?.role === 'staff' || profile?.role === 'admin'

  // Guard 1: role-gated UI
  if (!isStaffOrAdmin) return null
  // Guard 2: null/empty recording — no broken player
  if (!recordingUrl) return null

  const heightClass = variant === 'compact' ? 'h-8' : 'h-10'

  return (
    <div className="flex items-center gap-2">
      <audio
        controls
        preload="none"
        src={recordingUrl}
        className={`${heightClass} max-w-full`}
      >
        Your browser does not support audio playback.
      </audio>
      <a
        href={recordingUrl}
        download
        target="_blank"
        rel="noopener noreferrer"
        title="Download recording"
        aria-label="Download recording"
        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-700 transition-colors shrink-0"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

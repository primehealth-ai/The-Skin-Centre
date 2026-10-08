import { BarChart2 } from 'lucide-react'
import AnalyticsDashboard from './AnalyticsDashboard'

export const dynamic = 'force-dynamic'

export default function AnalyticsPage() {
  return (
    <div className="space-y-6 pb-12">
      {/* ── A) PAGE HEADER (server rendered) ─────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100/60 dark:border-blue-900/40">
          <BarChart2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Analytics</h1>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">The Skin Centre — Performance Intelligence</p>
        </div>
      </div>

      {/* ── Client Interactivity Container ──────────────────────────────────── */}
      <AnalyticsDashboard />
    </div>
  )
}

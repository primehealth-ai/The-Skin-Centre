import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: number | string
  icon: LucideIcon
  trend?: string
  trendUp?: boolean
  color: 'blue' | 'red' | 'green' | 'purple' | 'orange'
}

const colorMap = {
  blue: 'bg-blue-50/70 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/30',
  red: 'bg-rose-50/70 text-rose-600 dark:bg-rose-950/40 dark:text-rose-450 border border-rose-100/50 dark:border-rose-900/30',
  green: 'bg-emerald-50/70 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-450 border border-emerald-100/50 dark:border-emerald-900/30',
  purple: 'bg-indigo-50/70 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-405 border border-indigo-100/50 dark:border-indigo-900/30',
  orange: 'bg-amber-50/70 text-amber-600 dark:bg-amber-950/40 dark:text-amber-450 border border-amber-100/50 dark:border-amber-900/30',
}

const borderHighlight = {
  blue: 'border-t-2 border-blue-500/80',
  red: 'border-t-2 border-rose-500/80',
  green: 'border-t-2 border-emerald-500/80',
  purple: 'border-t-2 border-indigo-500/80',
  orange: 'border-t-2 border-amber-500/80',
}

export default function StatCard({
  title, value, icon: Icon,
  trend, trendUp, color
}: StatCardProps) {
  return (
    <div className={`relative overflow-hidden bg-white/95 dark:bg-slate-900/90 backdrop-blur-xs rounded-2xl p-6 shadow-sm border border-slate-200/60 dark:border-slate-800/80 hover:-translate-y-1 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300 ease-out group ${borderHighlight[color]}`}>
      {/* Decorative background glow blob */}
      <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-gradient-to-br from-slate-100 to-slate-200/10 dark:from-slate-850 dark:to-slate-900/10 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />
      
      <div className="relative z-10 flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-slate-400 dark:text-slate-500 text-[10px] font-extrabold uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight leading-none pt-0.5">{value}</p>
          {trend && (
            <p className={`text-[10px] font-extrabold uppercase tracking-wider mt-2 flex items-center gap-1 ${
              trendUp ? 'text-emerald-600 dark:text-emerald-455' : 'text-rose-600 dark:text-rose-455'
            }`}>
              <span className="text-xs">{trendUp ? '↑' : '↓'}</span> {trend}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl shadow-xs group-hover:scale-105 transition-transform duration-300 ${colorMap[color]}`}>
          <Icon size={18} className="stroke-[2.5]" />
        </div>
      </div>
    </div>
  )
}

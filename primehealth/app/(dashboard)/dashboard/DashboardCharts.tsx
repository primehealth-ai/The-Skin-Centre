'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'
import { motion } from 'framer-motion'
import { TrendingUp, Activity, PieChart as PieChartIcon } from 'lucide-react'

// --- Types ---
interface BarData {
  date: string
  answered: number
  missed: number
}

interface PieData {
  name: string
  value: number
  color: string
}

interface LineData {
  date: string
  rate: number
}

interface DashboardChartsProps {
  barChartData: BarData[]
  pieChartData: PieData[]
  lineChartData: LineData[]
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/50 p-4 rounded-xl shadow-2xl z-50">
        <p className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-slate-100 font-medium text-sm">
                {entry.name}: <span className="font-bold">{entry.value}{entry.unit}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

export default function DashboardCharts({ barChartData, pieChartData, lineChartData }: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
      
      {/* --- Bar Chart: Calls Last 7 Days --- */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="xl:col-span-2 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 group"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Activity size={16} className="text-blue-500" />
              Call Volume (Last 7 Days)
            </h3>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Answered vs Missed</p>
          </div>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAnswered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.3}/>
                </linearGradient>
                <linearGradient id="colorMissed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.3}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} />
              <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#334155', opacity: 0.1 }} />
              <Bar dataKey="answered" name="Answered" stackId="a" fill="url(#colorAnswered)" radius={[0, 0, 4, 4]} />
              <Bar dataKey="missed" name="Missed" stackId="a" fill="url(#colorMissed)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* --- Pie Chart: Missed Call Status --- */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 relative overflow-hidden"
      >
        {/* Decorative background glow */}
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="mb-2 relative z-10">
          <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <PieChartIcon size={16} className="text-indigo-500" />
            Missed Calls Status
          </h3>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Overall Breakdown</p>
        </div>
        <div className="h-[220px] w-full relative z-10">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col mt-4">
            <span className="text-3xl font-black text-slate-800 dark:text-slate-100">
              {pieChartData.reduce((acc, curr) => acc + curr.value, 0)}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total</span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mt-4 relative z-10">
          {pieChartData.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">{entry.name}</p>
                <p className="text-xs font-black text-slate-800 dark:text-slate-200">{entry.value}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* --- Line Chart: Recovery Rate Trend --- */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="xl:col-span-3 bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 rounded-3xl p-6 shadow-xl relative overflow-hidden group"
      >
        <div className="absolute top-0 right-0 p-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all duration-700 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <div>
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-400" />
              Recovery Rate Trend
            </h3>
            <p className="text-[11px] font-bold text-emerald-400/60 uppercase tracking-widest mt-1">Last 30 Days Performance</p>
          </div>
          
          <div className="flex items-baseline gap-2 bg-slate-950/40 px-4 py-2 rounded-xl border border-white/5">
            <span className="text-3xl font-black text-white">
              {lineChartData.length > 0 ? lineChartData[lineChartData.length - 1].rate : 0}%
            </span>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Current</span>
          </div>
        </div>
        
        <div className="h-[240px] w-full relative z-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={lineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
              <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '4 4', fill: 'transparent' }} />
              <Area type="monotone" dataKey="rate" name="Recovery Rate" unit="%" stroke="#10b981" strokeWidth={4} fill="url(#colorRate)" activeDot={{ r: 6, fill: '#10b981', stroke: '#022c22', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

    </div>
  )
}

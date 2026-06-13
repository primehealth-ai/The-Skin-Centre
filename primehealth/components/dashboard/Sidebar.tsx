'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Phone, PhoneMissed,
  MessageSquare, Users, FileText,
  Camera, LogOut
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/calls', icon: Phone, label: 'All Calls' },
  { href: '/missed-calls', icon: PhoneMissed, label: 'Missed Calls' },
  { href: '/whatsapp', icon: MessageSquare, label: 'WhatsApp' },
  { href: '/patients', icon: Users, label: 'Patients' },
  { href: '/consents', icon: FileText, label: 'Consents' },
  { href: '/photos', icon: Camera, label: 'Photos' },
]

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* Mobile Backdrop overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container with sliding animation */}
      <aside 
        aria-label="Main navigation"
        className={`fixed top-0 bottom-0 left-0 z-40 w-[280px] bg-slate-950/95 backdrop-blur-md flex flex-col h-full shrink-0 border-r border-slate-900 transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Glowing dot indicator */}
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-md shadow-blue-500/80" />
            <div>
              <h2 className="bg-gradient-to-r from-blue-400 via-indigo-400 to-indigo-500 bg-clip-text text-transparent font-extrabold text-xl tracking-tight leading-none">PrimeHealth</h2>
              <p className="text-slate-500 text-[9px] font-extrabold uppercase tracking-widest mt-1">The Skin Centre, Patna</p>
            </div>
          </div>
          {onClose && (
            <button 
              onClick={onClose}
              className="lg:hidden text-slate-400 hover:text-white p-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-800"
              aria-label="Close sidebar"
            >
              <XIcon />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/10'
                    : 'text-slate-400 hover:bg-slate-900/60 hover:text-white hover:pl-5'
                }`}
              >
                <item.icon size={16} className={`transition-transform duration-350 group-hover:scale-110 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
                <span className="text-xs font-extrabold tracking-wide">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-slate-900">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-slate-400 hover:bg-rose-950/20 hover:text-rose-400 border border-transparent hover:border-rose-950 transition-all duration-200 group hover:pl-5"
          >
            <LogOut size={16} className="text-slate-400 group-hover:text-rose-400 transition-transform group-hover:-translate-x-0.5" />
            <span className="text-xs font-extrabold tracking-wide">Logout</span>
          </button>
        </div>
      </aside>
    </>
  )
}

function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

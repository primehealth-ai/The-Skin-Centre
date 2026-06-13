import * as React from 'react'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 relative overflow-hidden">
      {/* Dynamic Background Light Rings */}
      <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[600px] w-[600px] bg-indigo-500/10 rounded-full blur-[120px]" />
      
      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-4 py-8">
        {children}
      </div>
    </div>
  )
}

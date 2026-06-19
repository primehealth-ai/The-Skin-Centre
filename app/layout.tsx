import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'PrimeHealth — Clinic Intelligence',
    template: '%s | PrimeHealth',
  },
  description:
    'Clinic intelligence system for The Skin Centre, Patna. Manage calls, missed call recovery, WhatsApp messaging, patient consents, and before/after photos — all in one place.',
  keywords: [
    'clinic management',
    'dermatology',
    'skin care',
    'hair care',
    'missed call recovery',
    'WhatsApp automation',
    'patient management',
    'The Skin Centre',
    'Patna',
  ],
  authors: [{ name: 'Dr. Abhinav Kumar' }],
  robots: { index: false, follow: false },
  openGraph: {
    title: 'PrimeHealth — Clinic Intelligence',
    description:
      'Missed call recovery, WhatsApp messaging & patient management for The Skin Centre, Patna.',
    type: 'website',
    locale: 'en_IN',
    siteName: 'PrimeHealth',
  },
  icons: {
    icon: '/favicon.ico',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${inter.variable} font-sans antialiased h-full text-slate-900 bg-slate-50 dark:text-slate-100 dark:bg-slate-950`}
      >
        {children}
      </body>
    </html>
  )
}

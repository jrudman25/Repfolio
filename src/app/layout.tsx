import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import 'devicon/devicon-base.css'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Proofstack - AI Powered Portfolio',
  description: 'Manage and sync your GitHub projects with Gemini AI.',
}

import ChatWidget from '@/components/ChatWidget'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-white selection:bg-zinc-800`}>
        {children}
        <ChatWidget />
      </body>
    </html>
  )
}

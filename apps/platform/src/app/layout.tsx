import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'KAP — KickStartering Agent Platform',
  description: 'Community-driven crowdfunding powered by AI agents',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100 font-sans antialiased">
        {children}
      </body>
    </html>
  )
}

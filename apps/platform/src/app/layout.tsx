import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'BigStarter — The Kickstarter for Vibe Coding',
  description: 'Every project here is built in public with AI agents. No backend. GitHub is the source of truth.',
}

function NavHeader() {
  return (
    <header className="border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-sm sticky top-0 z-10">
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-bold tracking-tight hover:text-indigo-400 transition">
          <span className="text-indigo-400 text-lg">◆</span>
          <span>BigStarter</span>
        </a>
        <nav className="flex items-center gap-3">
          <a href="/" className="text-sm text-gray-400 hover:text-white transition hidden sm:block">
            Explore
          </a>
          <a href="/install/"
            className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition font-medium">
            Add yours
          </a>
        </nav>
      </div>
    </header>
  )
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100 font-sans antialiased">
        <NavHeader />
        {children}
      </body>
    </html>
  )
}

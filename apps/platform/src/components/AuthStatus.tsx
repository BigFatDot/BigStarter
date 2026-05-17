'use client'

import { useEffect, useState } from 'react'
import { getStoredUser, clearAuth, trustScore, authenticate } from '@/lib/github-auth'

interface GitHubUser {
  login: string
  avatar_url: string
  name: string | null
  created_at: string
  public_repos: number
  followers: number
  public_gists: number
}

export function AuthStatus() {
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setUser(getStoredUser())
  }, [])

  if (!mounted) return null

  if (user) {
    const score = trustScore(user)
    return (
      <div className="flex items-center gap-2">
        <img src={user.avatar_url} alt={user.login}
          className="h-6 w-6 rounded-full border border-gray-700" />
        <span className="text-xs text-gray-400">@{user.login}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full
          ${score >= 60 ? 'bg-green-900/40 text-green-400'
          : score >= 30 ? 'bg-yellow-900/40 text-yellow-400'
          : 'bg-gray-800 text-gray-500'}`}>
          {score}
        </span>
        <button onClick={() => { clearAuth(); setUser(null) }}
          className="text-xs text-gray-600 hover:text-gray-400 transition">
          ×
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={async () => {
        const u = await authenticate({
          onCode: (code, url) => {
            window.open(url, '_blank')
            alert(`Enter code: ${code}`)
          },
          onSuccess: (u) => setUser(u),
        })
      }}
      className="text-xs text-gray-500 hover:text-indigo-400 transition border border-gray-700 hover:border-indigo-700 px-2.5 py-1 rounded-lg"
    >
      Connect GitHub
    </button>
  )
}

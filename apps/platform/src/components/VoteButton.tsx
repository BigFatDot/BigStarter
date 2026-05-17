'use client'

import { useState, useCallback } from 'react'
import { voteOnIssue, getStoredUser, authenticate, trustScore } from '@/lib/github-auth'

interface Props {
  owner:       string
  repo:        string
  issueNumber: number
  initialVotes: number
  signalTitle: string
}

type AuthState = 'idle' | 'waiting_code' | 'success' | 'error'

export function VoteButton({ owner, repo, issueNumber, initialVotes, signalTitle }: Props) {
  const [votes, setVotes]     = useState(initialVotes)
  const [voted, setVoted]     = useState(false)
  const [authState, setAuthState] = useState<AuthState>('idle')
  const [userCode, setUserCode]   = useState<string | null>(null)
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const handleVote = useCallback(async () => {
    if (voted) return
    setAuthState('idle')
    setError(null)

    const ok = await voteOnIssue(owner, repo, issueNumber, {
      onCode: (code, url) => {
        setUserCode(code)
        setVerifyUrl(url)
        setAuthState('waiting_code')
      },
      onSuccess: () => {
        setAuthState('success')
        setUserCode(null)
        setVerifyUrl(null)
        setVoted(true)
        setVotes(v => v + 1)
      },
      onError: (msg) => {
        setAuthState('error')
        setError(msg)
      },
    })

    if (ok && authState !== 'waiting_code') {
      setVoted(true)
      setVotes(v => v + 1)
    }
  }, [voted, owner, repo, issueNumber, authState])

  // Waiting for user to enter code on GitHub
  if (authState === 'waiting_code' && userCode && verifyUrl) {
    return (
      <div className="rounded-xl border border-indigo-700/60 bg-indigo-950/40 p-4 text-sm">
        <p className="font-medium text-indigo-300 mb-2">Connect with GitHub to vote</p>
        <p className="text-gray-400 mb-3">
          Open{' '}
          <a href={verifyUrl} target="_blank" rel="noopener noreferrer"
            className="text-indigo-400 underline">github.com/login/device</a>
          {' '}and enter:
        </p>
        <div className="font-mono text-2xl font-bold text-white tracking-widest text-center py-2 bg-gray-900 rounded-lg mb-3">
          {userCode}
        </div>
        <p className="text-xs text-gray-500 text-center">Waiting for confirmation…</p>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={handleVote}
        disabled={voted}
        className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full transition
          ${voted
            ? 'bg-indigo-900/60 text-indigo-300 cursor-default'
            : 'bg-gray-800 hover:bg-indigo-900/60 text-gray-400 hover:text-indigo-300 cursor-pointer'
          }`}
      >
        <span>{voted ? '✓' : '👍'}</span>
        <span>{votes}</span>
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

'use client'

/**
 * GitHub Device Flow OAuth — client-side only, no backend needed.
 * RFC 8628: https://tools.ietf.org/html/rfc8628
 *
 * The client_id is public by design (Device Flow has no client_secret).
 * Token stored in sessionStorage — cleared on tab close, scoped to origin.
 */

const CLIENT_ID = process.env['NEXT_PUBLIC_GITHUB_CLIENT_ID'] ?? 'Ov23liExample000'
const SCOPE     = 'public_repo'

interface DeviceCodeResponse {
  device_code:      string
  user_code:        string
  verification_uri: string
  expires_in:       number
  interval:         number
}

interface TokenResponse {
  access_token?: string
  error?:        string
  error_description?: string
}

interface GitHubUser {
  login:        string
  avatar_url:   string
  name:         string | null
  created_at:   string
  public_repos: number
  followers:    number
  public_gists: number
}

const TOKEN_KEY   = 'bigstarter_gh_token'
const USER_KEY    = 'bigstarter_gh_user'

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): GitHubUser | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as GitHubUser } catch { return null }
}

export function clearAuth(): void {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
}

/** Trust score 0–100 based on public GitHub profile */
export function trustScore(user: GitHubUser): number {
  const ageYears = (Date.now() - new Date(user.created_at).getTime())
    / (1000 * 60 * 60 * 24 * 365)
  return Math.min(100, Math.round(
    ageYears          * 12 +
    user.public_repos *  2 +
    user.followers    *  1 +
    user.public_gists *  1
  ))
}

type AuthCallbacks = {
  onCode?: (code: string, url: string) => void
  onSuccess?: (user: GitHubUser) => void
  onError?: (msg: string) => void
}

/**
 * Full Device Flow authentication.
 * Returns the access token, or null if cancelled/expired.
 */
export async function authenticate(cb: AuthCallbacks = {}): Promise<string | null> {
  // Already have a valid token
  const existing = getStoredToken()
  if (existing) {
    const user = getStoredUser()
    if (user) { cb.onSuccess?.(user); return existing }
  }

  try {
    // 1. Request device + user code
    const codeRes = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE }),
    })
    if (!codeRes.ok) throw new Error('Failed to request device code')
    const { device_code, user_code, verification_uri, interval, expires_in }
      = await codeRes.json() as DeviceCodeResponse

    // 2. Show code to user
    cb.onCode?.(user_code, verification_uri)

    // 3. Poll for token (up to expires_in seconds)
    const maxAttempts = Math.floor(expires_in / (interval + 1))
    for (let i = 0; i < maxAttempts; i++) {
      await sleep((interval + 1) * 1000)

      const pollRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id:   CLIENT_ID,
          device_code,
          grant_type:  'urn:ietf:params:oauth:grant-type:device_code',
        }),
      })
      const poll = await pollRes.json() as TokenResponse

      if (poll.access_token) {
        // 4. Fetch user profile
        const userRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${poll.access_token}` },
        })
        const user = await userRes.json() as GitHubUser

        sessionStorage.setItem(TOKEN_KEY, poll.access_token)
        sessionStorage.setItem(USER_KEY, JSON.stringify(user))
        cb.onSuccess?.(user)
        return poll.access_token
      }

      if (poll.error === 'expired_token' || poll.error === 'access_denied') {
        cb.onError?.(poll.error_description ?? poll.error ?? 'Auth failed')
        return null
      }
      // 'authorization_pending' or 'slow_down' → keep polling
    }

    cb.onError?.('Authentication timed out')
    return null

  } catch (err) {
    cb.onError?.((err as Error).message)
    return null
  }
}

/** Vote (+1 reaction) on a GitHub Issue. Authenticates if needed. */
export async function voteOnIssue(
  owner: string, repo: string, issueNumber: number,
  cb: AuthCallbacks = {}
): Promise<boolean> {
  let token = getStoredToken()
  if (!token) token = await authenticate(cb)
  if (!token) return false

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/reactions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '+1' }),
    }
  )
  return res.ok || res.status === 422 // 422 = already voted
}

/** Submit a feature request as a GitHub Issue. */
export async function submitFeatureRequest(
  owner: string, repo: string, title: string, body: string,
  cb: AuthCallbacks = {}
): Promise<string | null> {
  let token = getStoredToken()
  if (!token) token = await authenticate(cb)
  if (!token) return null

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, labels: ['kap-signal'] }),
    }
  )
  if (!res.ok) return null
  const issue = await res.json() as { html_url: string }
  return issue.html_url
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

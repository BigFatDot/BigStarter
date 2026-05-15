import type { NextConfig } from 'next'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000'

const nextConfig: NextConfig = {
  output: 'standalone',

  // Proxy /api/* et /stream/* vers le backend Fastify
  // → une seule URL ngrok pour tout
  async rewrites() {
    return [
      // /api/v1/* and webhook endpoints → Fastify
      // /api/stream/* stays in Next.js (SSE)
      { source: '/api/v1/:path*',        destination: `${API_URL}/api/v1/:path*` },
      { source: '/webhooks/github',      destination: `${API_URL}/webhooks/github` },
      { source: '/github/:path*',        destination: `${API_URL}/github/:path*` },
      { source: '/health',               destination: `${API_URL}/health` },
    ]
  },
}

export default nextConfig

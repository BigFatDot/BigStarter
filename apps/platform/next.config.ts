import type { NextConfig } from 'next'

// On GitHub Pages the site lives at /BigStarter/ — set basePath accordingly.
// In local dev or non-CI environments the site is at /.
const basePath = process.env['CI'] === 'true' ? '/BigStarter' : ''

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
}

export default nextConfig

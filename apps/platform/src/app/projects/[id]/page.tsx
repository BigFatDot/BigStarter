/**
 * Legacy route — /projects/[id]
 * The new routing is /projects/[owner]/[repo].
 * This stub satisfies generateStaticParams for static export (no known IDs to pre-render).
 */
import { notFound } from 'next/navigation'

export function generateStaticParams(): Array<{ id: string }> {
  return []
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function LegacyProjectPage(_props: { params: Promise<{ id: string }> }) {
  notFound()
}

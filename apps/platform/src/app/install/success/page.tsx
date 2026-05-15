/**
 * Install success page — /install/success
 * Shown after GitHub App installation completes.
 */

interface PageProps {
  searchParams: Promise<{ installation?: string }>
}

export default async function InstallSuccessPage({ searchParams }: PageProps) {
  const { installation } = await searchParams

  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center">
      <div className="mb-8 text-5xl">✓</div>

      <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-indigo-400">
        GitHub App installed
      </h1>

      <p className="mb-8 text-lg text-gray-300">
        KAP is now connected to your repository.
        {installation && (
          <span className="block mt-2 text-sm text-gray-500">
            Installation ID: {installation}
          </span>
        )}
      </p>

      <div className="rounded-xl border border-gray-700 bg-gray-900 p-6 text-left text-sm text-gray-400 mb-8">
        <p className="font-semibold text-gray-200 mb-3">What happens next</p>
        <ul className="space-y-2">
          <li>• Your project page will be ready in a few minutes</li>
          <li>• Push a commit to trigger your first public update</li>
          <li>• Open a GitHub Issue to create a community signal</li>
          <li>• Add <code className="text-indigo-300">ANTHROPIC_API_KEY</code> to your repo secrets for AI-generated updates</li>
        </ul>
      </div>

      <a
        href="/"
        className="inline-block rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500 transition"
      >
        Go to dashboard
      </a>
    </main>
  )
}

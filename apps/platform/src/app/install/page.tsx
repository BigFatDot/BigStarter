/**
 * Install page — /install
 * One-click GitHub App installation for existing projects.
 */

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000'

export default function InstallPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center">

      <p className="mb-4 text-sm font-medium uppercase tracking-widest text-indigo-400">
        KAP — Build in Public
      </p>

      <h1 className="mb-6 text-4xl font-extrabold tracking-tight">
        Connect your GitHub project
      </h1>

      <p className="mb-10 text-lg leading-relaxed text-gray-300">
        Install the KAP GitHub App on any repo. Your commits, PRs, and community signals
        automatically flow to your public project page — no SDK, no configuration.
      </p>

      <div className="mb-10 rounded-xl border border-gray-700 bg-gray-900 p-8 text-left">
        <h2 className="mb-4 text-base font-semibold text-gray-200">What happens after install</h2>
        <ol className="space-y-3 text-sm text-gray-400">
          <li className="flex gap-3">
            <span className="text-indigo-400 font-bold">1.</span>
            <span>KAP reads your repo history and bootstraps the project page</span>
          </li>
          <li className="flex gap-3">
            <span className="text-indigo-400 font-bold">2.</span>
            <span>Every commit, merged PR, and release auto-publishes an update</span>
          </li>
          <li className="flex gap-3">
            <span className="text-indigo-400 font-bold">3.</span>
            <span>Your GitHub Issues become community signals — votes and funding enabled</span>
          </li>
          <li className="flex gap-3">
            <span className="text-indigo-400 font-bold">4.</span>
            <span>Decisions are recorded in <code className="text-indigo-300">.kap/</code> in your repo — readable, versioned, git-tracked</span>
          </li>
        </ol>
      </div>

      <a
        href={`${API_URL}/github/install`}
        className="inline-flex items-center gap-3 rounded-lg bg-indigo-600 px-8 py-4 text-base font-semibold text-white transition hover:bg-indigo-500"
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
        Install GitHub App
      </a>

      <p className="mt-6 text-xs text-gray-600">
        Free for open source. The App only requests permissions it needs.
      </p>

    </main>
  )
}

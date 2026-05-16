/**
 * Install page — /install
 */
export default function InstallPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">

      <div className="text-center mb-12">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-indigo-400">
          BigStarter — Build in Public
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">
          Add your project
        </h1>
        <p className="text-lg text-gray-400">
          One command. Your project builds in public automatically.
        </p>
      </div>

      {/* Primary CTA */}
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-6 mb-8">
        <p className="text-xs text-indigo-400 font-medium uppercase tracking-wider mb-3">Step 1 — Run in your project directory</p>
        <div className="flex items-center gap-3 bg-gray-900 rounded-lg px-4 py-3 font-mono text-sm">
          <span className="text-gray-500 select-none">$</span>
          <span className="text-indigo-300 flex-1">npx bigstarter init</span>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Requires a GitHub token with <code className="text-gray-400">repo</code> scope.
          Generate one at <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">github.com/settings/tokens</a>
        </p>
      </div>

      {/* What init does */}
      <div className="rounded-xl border border-gray-700/60 bg-gray-900/40 p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-200 mb-4">What happens automatically</h2>
        <ol className="space-y-3 text-sm text-gray-400">
          <li className="flex gap-3">
            <span className="text-indigo-400 font-bold shrink-0">1.</span>
            <span>Creates <code className="text-indigo-300">.kap/kap.json</code> with your project metadata</span>
          </li>
          <li className="flex gap-3">
            <span className="text-indigo-400 font-bold shrink-0">2.</span>
            <span>Configures the BigStarter MCP plugin in Claude Code</span>
          </li>
          <li className="flex gap-3">
            <span className="text-indigo-400 font-bold shrink-0">3.</span>
            <span>Opens a PR on the BigStarter registry — your project appears on the platform</span>
          </li>
          <li className="flex gap-3">
            <span className="text-indigo-400 font-bold shrink-0">4.</span>
            <span>Installs a GitHub Action that auto-publishes updates on every commit, PR merge, or release — and triggers an immediate platform rebuild</span>
          </li>
        </ol>
      </div>

      {/* Manual protocol */}
      <div className="rounded-xl border border-gray-700/40 bg-gray-900/20 p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-500 mb-4">Or manually — the protocol</h2>
        <ol className="space-y-2 text-sm text-gray-500">
          <li className="flex gap-3">
            <span className="shrink-0">1.</span>
            <span>Push <code className="text-gray-400">.kap/kap.json</code> with <code className="text-gray-400">{'{"name":"…","pitch":"…","tags":[]}'}</code></span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0">2.</span>
            <span>Push updates as <code className="text-gray-400">.kap/updates/YYYY-MM-DD-slug.md</code></span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0">3.</span>
            <span>Open GitHub Issues labeled <code className="text-gray-400">kap-signal</code> to collect votes</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0">4.</span>
            <span>Open a PR on <a href="https://github.com/BigFatDot/BigStarter" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">BigFatDot/BigStarter</a> to add yourself to registry.json — platform rebuilds immediately on merge</span>
          </li>
        </ol>
      </div>

      <p className="text-center text-xs text-gray-600">
        Free for open source. Your data stays in your GitHub repo.
      </p>

    </main>
  )
}

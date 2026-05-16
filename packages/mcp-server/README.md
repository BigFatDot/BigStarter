# bigstarter

**The Kickstarter for Vibe Coding** — a local MCP plugin that lets AI-assisted projects build in public.

## What it does

- Records every architectural decision to `.kap/decisions/` in your GitHub repo
- Generates public updates automatically after commits/milestones via LLM sampling
- Reads community signals from GitHub Issues
- Hooks framework for audit, circuit-breaking, and conventional commits

## Install

```bash
npx bigstarter init
```

This creates:
- `.kap/kap.json` — your project metadata
- `.mcp.json` — MCP server config (gitignored, has your GitHub token)
- `.github/workflows/bigstarter-reporter.yml` — auto-updates on push/PR/release

And opens a PR on the [BigStarter registry](https://github.com/BigFatDot/BigStarter) to list your project on the platform.

## Configure in Claude Code

**Global config** — configure once, works in every project:

Add to `~/.claude/settings.json`:

```json
{
  "env": {
    "GITHUB_TOKEN": "ghp_xxx"
  },
  "mcpServers": {
    "bigstarter": {
      "command": "npx",
      "args": ["bigstarter"]
    }
  }
}
```

That's it. BigStarter auto-detects `GITHUB_OWNER`, `GITHUB_REPO`, and `KAP_PROJECT_ID` from:
1. `.kap/kap.json` in the current project directory (authoritative)
2. `git remote get-url origin` (fallback)
3. The directory name (last resort)

**Per-project override** (optional) — only if you need non-standard values:

```json
{
  "env": {
    "GITHUB_OWNER": "your-username",
    "GITHUB_REPO": "your-repo",
    "KAP_PROJECT_ID": "custom-id"
  }
}
```

## Available tools

| Tool | When to use |
|------|-------------|
| `kap_report_event` | After commits, milestones, deploys |
| `kap_pkg_write` | After architectural decisions |
| `kap_pkg_build_context` | At session start |
| `kap_fetch_feedback` | Before sprint planning |
| `kap_pkg_query` | Before implementing a known pattern |
| `kap_escalate_to_admin` | When a decision exceeds your autonomy |

## Resources (via @mention)

- `@kap://decisions` — recent architectural decisions
- `@kap://vision` — project vision
- `@kap://signals` — community signals

## Platform

All projects with `.kap/kap.json` appear on [bigfatdot.github.io/BigStarter](https://bigfatdot.github.io/BigStarter).

## License

MIT

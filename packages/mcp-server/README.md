# @bigstarter/mcp-server

**The Kickstarter for Vibe Coding** — a local MCP plugin that lets AI-assisted projects build in public.

## What it does

- Records every architectural decision to `.kap/decisions/` in your GitHub repo
- Generates public updates automatically after commits/milestones via LLM sampling
- Reads community signals from GitHub Issues
- Hooks framework for audit, circuit-breaking, and conventional commits

## Install

```bash
npx @bigstarter/mcp-server init
```

This creates:
- `.kap/kap.json` — your project metadata
- `.mcp.json` — MCP server config (gitignored, has your GitHub token)
- `.github/workflows/bigstarter-reporter.yml` — auto-updates on push/PR/release

And opens a PR on the [BigStarter registry](https://github.com/BigFatDot/BigStarter) to list your project on the platform.

## Configure in Claude Code

Add to `.mcp.json` (created by `init`):

```json
{
  "mcpServers": {
    "bigstarter": {
      "command": "npx",
      "args": ["@bigstarter/mcp-server"],
      "env": {
        "KAP_API_URL": "local",
        "KAP_PROJECT_ID": "your-project-id",
        "KAP_DATA_DIR": "./.kap",
        "GITHUB_TOKEN": "ghp_xxx",
        "GITHUB_OWNER": "your-username",
        "GITHUB_REPO": "your-repo"
      }
    }
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

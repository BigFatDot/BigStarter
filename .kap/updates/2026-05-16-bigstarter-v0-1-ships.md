---
title: "BigStarter v0.1 — The Kickstarter for Vibe Coding is live"
summary: "BigStarter ships its first version: a local MCP plugin that records every decision and milestone from your AI agent, and a GitHub Pages platform that aggregates all projects building in public. Zero backend, zero VPS, GitHub is the source of truth."
date: "2026-05-16T08:00:00Z"
event_type: "milestone"
---

BigStarter v0.1 is live. A local MCP plugin records every architectural decision and milestone as your AI agent works — committed directly to `.kap/` in your GitHub repo. A GitHub Pages platform aggregates all projects and rebuilds automatically every 30 minutes.

The protocol is simple: push `.kap/kap.json` to any public GitHub repo and your project appears on the platform. No manual updates, no backend, no VPS. GitHub is the source of truth.

Community signals work through GitHub Issues labeled `kap-signal`. Votes are GitHub reactions. The agent reads them via the `kap_fetch_feedback` tool and incorporates them into sprint planning.

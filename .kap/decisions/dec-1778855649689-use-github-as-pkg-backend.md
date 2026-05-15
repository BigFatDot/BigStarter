---
id: dec-1778855649689
type: decision
title: Use GitHub as PKG backend
rationale: >-
  Zero infra, git history = audit trail, onboarding in 2 clicks via GitHub App,
  existing projects join instantly.
alternatives_rejected:
  - option: Kuzu local only
    reason: 'No scale, no sharing between team members'
  - option: PostgreSQL
    reason: 'Requires managed infra, no version history'
domain: architecture
confidence: 0.95
sprint: 1
timestamp: '2026-05-15T14:34:09.689Z'
---
Decisions, features, and signals stored in the GitHub repo itself via .kap/ directory.

#!/usr/bin/env node
/**
 * kap init — onboarding CLI
 * Installs SDK hooks, generates kap.config.json and CLAUDE.md template
 * in the developer's project directory.
 *
 * Usage: npx @kap/sdk init
 */

import { execSync } from 'node:child_process'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as readline from 'node:readline/promises'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

async function prompt(q: string): Promise<string> {
  const answer = await rl.question(q)
  return answer.trim()
}

async function main(): Promise<void> {
  const cwd = process.cwd()

  console.log('\nKAP — Connexion de votre projet\n')

  const projectId = await prompt('Project ID (depuis votre dashboard KAP) : ')
  const apiToken  = await prompt('API Token : ')
  const name      = await prompt('Nom du projet : ')
  const pitch     = await prompt('Pitch en une phrase : ')

  const level = await prompt(
    'Niveau d\'autonomie de l\'agent (0=tout approuver / 1=valider les grandes décisions / 2=autonome avec escalades) [1] : ',
  ) || '1'

  const transparency = await prompt(
    'Visibilité des updates (public / backers / contributors) [backers] : ',
  ) || 'backers'

  // --- kap.config.json ---
  const config = {
    projectId,
    name,
    pitch,
    apiUrl: 'https://api.kap.io',
    autonomyLevel: Number(level),
    transparency: {
      level: transparency,
      excludePatterns: ['**/.env*', '**/secrets/**', '**/node_modules/**'],
    },
    hooks: {
      git: ['post-commit', 'post-push'],
      ci: true,
    },
    escalate: {
      onArchitecturalDecision: true,
      onFinancialSpendAbove: 50,
      onBreakingChange: true,
      filePatterns: ['**/migrations/**', '**/auth/**'],
    },
  }

  writeFileSync(
    join(cwd, 'kap.config.json'),
    JSON.stringify(config, null, 2) + '\n',
  )
  console.log('  kap.config.json créé')

  // --- Git hooks ---
  const hooksDir = join(cwd, '.git', 'hooks')
  if (existsSync(join(cwd, '.git'))) {
    const postCommit = `#!/bin/sh\nnpx @kap/sdk hook post-commit\n`
    const postPush   = `#!/bin/sh\nnpx @kap/sdk hook post-push\n`
    writeFileSync(join(hooksDir, 'post-commit'), postCommit, { mode: 0o755 })
    writeFileSync(join(hooksDir, 'post-push'),   postPush,   { mode: 0o755 })
    console.log('  Git hooks installés (post-commit, post-push)')
  } else {
    console.warn('  Pas de répertoire .git trouvé — hooks non installés')
  }

  // --- .claude/settings.json (MCP server) ---
  const claudeDir = join(cwd, '.claude')
  if (!existsSync(claudeDir)) mkdirSync(claudeDir)

  const claudeSettings = {
    mcpServers: {
      kap: {
        command: 'npx',
        args: ['@kap/mcp-server'],
        env: {
          KAP_API_URL: 'https://api.kap.io',
          KAP_API_TOKEN: apiToken,
          KAP_PROJECT_ID: projectId,
        },
      },
    },
  }

  const settingsPath = join(claudeDir, 'settings.json')
  if (!existsSync(settingsPath)) {
    writeFileSync(settingsPath, JSON.stringify(claudeSettings, null, 2) + '\n')
    console.log('  .claude/settings.json créé (MCP server KAP)')
  } else {
    console.log('  .claude/settings.json existe déjà — ajoutez manuellement le serveur MCP kap')
    console.log(JSON.stringify(claudeSettings.mcpServers, null, 2))
  }

  // --- CLAUDE.md (instructions pour l'agent) ---
  const claudeMd = generateClaudeMd({ name, pitch, projectId, level: Number(level) })
  writeFileSync(join(cwd, 'CLAUDE.md'), claudeMd)
  console.log('  CLAUDE.md généré')

  // --- .gitignore : exclure le token ---
  const gitignorePath = join(cwd, '.gitignore')
  const tokenLine = '\n# KAP — ne jamais committer le token\n.env.kap\n'
  if (existsSync(gitignorePath)) {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(gitignorePath, tokenLine)
  }

  rl.close()
  console.log(`
Projet connecté à KAP.

Prochaines étapes :
  1. Lancez Claude Code dans ce répertoire
  2. Le serveur MCP kap est automatiquement disponible
  3. Chaque commit sera capturé et publié sur votre page projet
  4. La communauté peut déjà suivre votre projet sur :
     https://kap.io/p/${projectId}
`)
}

function generateClaudeMd(opts: {
  name: string
  pitch: string
  projectId: string
  level: number
}): string {
  const { name, pitch, projectId, level } = opts

  const autonomyInstructions: Record<number, string> = {
    0: `Propose chaque action significative à l'Admin avant de l'exécuter.
Appelle \`kap_escalate_to_admin\` pour toute décision architecturale, changement de dépendance, ou modification de schéma.
L'Admin approuve avant que tu continues.`,

    1: `Tu peux exécuter les tâches de développement de manière autonome.
Escalade à l'Admin via \`kap_escalate_to_admin\` pour :
- Toute décision architecturale (changement de DB, refactor majeur, nouvelle dépendance structurante)
- Tout changement dans les fichiers d'auth, de paiement, ou de migration
- Tout déploiement en production
Pour le reste : code, teste, commit de manière autonome.`,

    2: `Tu opères de manière pleinement autonome.
N'escalade que pour : dépenses financières, changements contractuels, décisions de pivotement produit.
Pour tout le reste, décide et execute.`,
  }

  return `# ${name}

> ${pitch}

---

## Connexion KAP

Ce projet est connecté à la plateforme KAP (project ID: \`${projectId}\`).
KAP publie ton avancement en temps réel sur une page publique et collecte le feedback de la communauté.

---

## Comportement attendu avec KAP

### Niveau d'autonomie configuré : ${level}

${autonomyInstructions[level] ?? autonomyInstructions[1]}

---

### Outils MCP disponibles

Le serveur MCP \`kap\` est disponible. Utilise ces outils :

**\`kap_report_event\`** — Signale un event significatif (milestone atteint, feature terminée, décision prise).
Appelle-le après chaque tâche complète, pas après chaque commit.

**\`kap_fetch_feedback\`** — Récupère le brief communautaire (top feature requests, votes, cagnottes actives).
Appelle-le en début de session ou quand tu cherches quoi traiter ensuite.

**\`kap_pkg_build_context\`** — Récupère le contexte du projet (décisions passées, contraintes actives, features en cours).
Appelle-le au début d'une nouvelle session ou avant une décision importante.

**\`kap_pkg_write\`** — Enregistre une décision dans la mémoire projet.
Appelle-le chaque fois que tu prends une décision architecturale ou technique significative.
Format : titre + description + rationale + alternatives rejetées.

**\`kap_escalate_to_admin\`** — Demande une décision à l'Admin.
Présente toujours : contexte, options avec pros/cons, ta recommandation.
Ne bloque pas sur une escalade — estime l'impact si l'Admin ne répond pas dans 24h.

**\`kap_trigger_vote\`** — Lance un vote communautaire si une décision peut être soumise à la communauté.
Exemple : "On implémente A ou B en priorité ?"

---

### Cycle de session recommandé

\`\`\`
1. Début de session
   └── kap_pkg_build_context("description de ce sur quoi tu travailles")
   └── kap_fetch_feedback()  ← voir si la communauté a exprimé des besoins récents

2. Pendant le travail
   └── code, teste, commit normalement
   └── kap_pkg_write() à chaque décision significative
   └── kap_escalate_to_admin() si niveau d'autonomie l'exige

3. Fin de session / milestone
   └── kap_report_event() avec résumé de ce qui a été fait
   └── Les git hooks publient automatiquement l'update sur la page projet
\`\`\`

---

### Ce qui est publié automatiquement

Les git hooks capturent et transmettent à KAP :
- Chaque commit (résumé généré automatiquement)
- Les résultats de CI/CD
- Les déploiements

**Ne jamais committer** : \`.env\`, tokens, credentials, données personnelles.
Patterns exclus de la publication : \`**/.env*\`, \`**/secrets/**\`

---

### Mémoire du projet

La mémoire long terme du projet est dans le PKG (Project Knowledge Graph) sur KAP.
À chaque nouvelle session, commence par \`kap_pkg_build_context\` pour récupérer le contexte pertinent.
Ne te fie pas uniquement à l'historique git pour les décisions — le PKG contient le *pourquoi*, git contient le *quoi*.
`
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

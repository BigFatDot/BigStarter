# KAP — Architecture Technique

> Décisions finales, revues à l'aune des standards agents IA — Mai 2026

---

## Principes directeurs

- **Un seul VPS, Docker Compose** — pas de services cloud multiples pour le MVP
- **Zéro managed SaaS critique** — Postgres, Redis, Kuzu sont on-prem
- **Croissance progressive** — on scale quand le problème se pose, pas avant
- **LemonSqueezy pour la TVA** — merchant of record, zero compliance
- **SDK hooks primaire, GitHub App optionnel** — git-agnostic par défaut
- **Agents avec budgets durs** — pas d'agent qui tourne sans limite de coût
- **Uniprocess sur Kuzu (MVP)** — migration pgvector en v0.2

---

## Décisions définitives

| Sujet | Décision | Raison |
|---|---|---|
| Déploiement | VPS Hetzner + Docker Compose | Simple, €15/mois, tout on-prem |
| Base de données | PostgreSQL self-hosted | Pas de Supabase, zéro latence réseau |
| Graph mémoire (MVP) | Kuzu embarqué, **uniprocess strict** | Fast, Cypher natif, une instance par projet |
| Graph mémoire (v0.2) | PostgreSQL + pgvector | Multi-process safe, embeddings, backup pg_dump |
| Realtime | Server-Sent Events (SSE) via Fastify | Unidirectionnel suffit pour le feed live |
| Jobs / queue | BullMQ + Redis self-hosted | Remplace Fly Machines, retry natif |
| Paiements SaaS | LemonSqueezy | Merchant of record, TVA auto UE |
| Cagnottes MVP | Pledges sans paiement réel | Valider avant la complexité légale |
| Cagnottes v1 | Stripe (quand validé) | Escrow marketplace |
| Git intégration | SDK hooks requis + GitHub App optionnel | Git-agnostic, onboarding < 5 min |
| Fork | Non | Confusion responsabilité, hors scope |
| Frontend | Next.js standalone sur VPS | Pas de Vercel |
| Reverse proxy | Caddy | Auto-SSL, config minimal |
| Budget agents | RunBudget wrapper, hard cap $1/tâche | Pas d'agent qui ruine en production |
| Observabilité | Structured logging JSON + table agent_runs | Debug sans dépendance externe |

---

## Processus et services

```
VPS Hetzner CX31 (4 vCPU, 8GB RAM, ~€20/mois)
│
├── Caddy (ports 80/443) — reverse proxy + SSL auto
│
├── kap-api (Fastify)
│   Routes REST + SSE
│   Lit/écrit PostgreSQL
│   Enqueue BullMQ jobs
│   NE LIT PAS KUZU DIRECTEMENT (invariant MVP)
│
├── kap-worker (BullMQ worker, 2 répliques)
│   SEUL processus qui accède à Kuzu
│   Traite : reporter / verifier / po / promoter
│   Appelle Claude API avec RunBudget
│   Publie les résultats → PostgreSQL + Redis Pub/Sub → SSE
│
├── kap-platform (Next.js standalone)
│   Pages projet publiques, Feature Board
│   Dashboard Admin, dashboard Backer
│
├── postgres:16
│   Projets, users, events, updates publiées
│   Signaux, pledges, escalades
│   agent_runs (observabilité)
│
├── redis:7-alpine
│   BullMQ queues + Pub/Sub pour SSE
│
└── Volumes Docker
    ├── pg_data/       ← PostgreSQL
    ├── redis_data/    ← Redis
    ├── kuzu_data/     ← Un .db par projet (accès worker uniquement)
    └── caddy_data/    ← Certificats SSL
```

---

## CRITIQUE 1 — Kuzu : invariant uniprocess

### Problème

Kuzu est file-based. Si l'API et le worker accèdent simultanément au même `.db` → transactions concurrentes non gérées → corruption silencieuse.

### Solution MVP : séparation stricte des responsabilités

```
kap-api  → lit PostgreSQL uniquement
              (les résultats des agents sont copiés dans Postgres après traitement)
              
kap-worker → lit/écrit Kuzu + écrit PostgreSQL
              (unique propriétaire du fichier .db)
```

Toute lecture PKG depuis l'API passe par des vues PostgreSQL synchronisées par le worker :

```sql
-- Vue synchronisée depuis le worker après chaque modification PKG
CREATE TABLE pkg_decisions_cache (
  project_id   TEXT NOT NULL,
  node_id      TEXT NOT NULL,
  title        TEXT,
  domain       TEXT,
  rationale    TEXT,
  confidence   FLOAT,
  sprint       INT,
  timestamp    TIMESTAMPTZ,
  synced_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, node_id)
);
```

### Migration v0.2 : PostgreSQL + pgvector

Quand le multi-process devient nécessaire (plusieurs workers, déploiement multi-instance) :

```sql
-- Extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Remplacement de Kuzu
CREATE TABLE pkg_nodes (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  node_type   TEXT NOT NULL,  -- decision, feature, component, etc.
  data        JSONB NOT NULL, -- le nœud complet sérialisé
  embedding   vector(1536),   -- Voyage AI ou OpenAI text-embedding-3-small
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pkg_edges (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  edge_type   TEXT NOT NULL,
  payload     JSONB DEFAULT '{}'
);

-- Index pour similarité cosine
CREATE INDEX ON pkg_nodes USING ivfflat (embedding vector_cosine_ops);

-- Recherche sémantique
SELECT id, data, 1 - (embedding <=> $query_embedding) AS similarity
FROM pkg_nodes
WHERE project_id = $pid
ORDER BY embedding <=> $query_embedding
LIMIT 10;
```

`PKGService` étant une interface, la migration est transparente pour les agents.

---

## CRITIQUE 2 — RunBudget : hard cap sur chaque agent

### Problème

Un agent buggé peut boucler indéfiniment et consommer des centaines de dollars d'API Claude sans aucune limite dans le code actuel.

### Solution : RunBudget wrapper

```typescript
// packages/agents/src/budget.ts

export interface RunBudget {
  max_tokens_per_call: number   // limite par message Claude
  max_iterations:      number   // max appels Claude dans ce run
  max_cost_usd:        number   // hard cap en dollars
  timeout_ms:          number   // wall-clock timeout
}

export const DEFAULT_BUDGETS: Record<string, RunBudget> = {
  reporter:   { max_tokens_per_call: 2048, max_iterations: 3, max_cost_usd: 0.50, timeout_ms: 60_000 },
  verifier:   { max_tokens_per_call: 2048, max_iterations: 2, max_cost_usd: 0.30, timeout_ms: 45_000 },
  po:         { max_tokens_per_call: 4096, max_iterations: 3, max_cost_usd: 1.00, timeout_ms: 90_000 },
  promoter:   { max_tokens_per_call: 2048, max_iterations: 2, max_cost_usd: 0.30, timeout_ms: 45_000 },
  orchestrator: { max_tokens_per_call: 8096, max_iterations: 10, max_cost_usd: 2.00, timeout_ms: 300_000 },
}

export class BudgetedClaude {
  private totalCost = 0
  private iterations = 0
  private deadline: number

  constructor(
    private claude: Anthropic,
    private budget: RunBudget,
    private runId: string,
  ) {
    this.deadline = Date.now() + budget.timeout_ms
  }

  async create(params: Anthropic.MessageCreateParams): Promise<Anthropic.Message> {
    if (Date.now() > this.deadline) {
      throw new BudgetError('timeout', this.runId, this.budget)
    }
    if (this.iterations >= this.budget.max_iterations) {
      throw new BudgetError('max_iterations', this.runId, this.budget)
    }
    if (this.totalCost >= this.budget.max_cost_usd) {
      throw new BudgetError('max_cost', this.runId, this.budget)
    }

    this.iterations++
    const response = await this.claude.messages.create({
      ...params,
      max_tokens: Math.min(params.max_tokens ?? 4096, this.budget.max_tokens_per_call),
    })

    const cost = estimateCost(response.usage, params.model)
    this.totalCost += cost

    // Log structuré — toujours
    console.info(JSON.stringify({
      event:       'agent_call',
      run_id:      this.runId,
      iteration:   this.iterations,
      model:       params.model,
      tokens_in:   response.usage.input_tokens,
      tokens_out:  response.usage.output_tokens,
      cost_usd:    cost,
      total_cost:  this.totalCost,
      ts:          new Date().toISOString(),
    }))

    return response
  }
}

function estimateCost(usage: Anthropic.Usage, model: string): number {
  // Sonnet 4.5 : $3/$15 per MTok in/out
  const rates: Record<string, [number, number]> = {
    'claude-sonnet-4-5': [3, 15],
    'claude-haiku-4-5':  [0.25, 1.25],
    'claude-opus-4-7':   [15, 75],
  }
  const [inRate, outRate] = rates[model] ?? [3, 15]
  return (usage.input_tokens * inRate + usage.output_tokens * outRate) / 1_000_000
}

export class BudgetError extends Error {
  constructor(
    public reason: 'timeout' | 'max_iterations' | 'max_cost',
    public runId: string,
    public budget: RunBudget,
  ) {
    super(`Agent budget exceeded (${reason}) on run ${runId}`)
  }
}
```

---

## CRITIQUE 3 — Coordination agents : file scope isolation

### Problème

Deux Builder Agents en parallèle sur les mêmes fichiers → merge conflicts silencieux → tests échouent → Verifier confus.

### Solution : fileScope par tâche + locking léger

```typescript
// packages/orchestrator/src/types.ts — ajout
export interface AgentTask {
  id:          string
  type:        TaskType
  projectId:   string
  featureId?:  string
  input:       Record<string, unknown>
  status:      TaskStatus
  result?:     Record<string, unknown>
  retries:     number
  maxRetries:  number
  deps:        string[]          // task ids
  fileScope?:  string[]          // NEW — fichiers que cette tâche va modifier
  startedAt?:  Date
  completedAt?: Date
  errorMessage?: string
}

// packages/orchestrator/src/index.ts — dans phaseExecuting
private async phaseExecuting(): Promise<void> {
  const running = this.ctx.taskQueue.filter(t => t.status === 'running')
  const runningFiles = new Set(running.flatMap(t => t.fileScope ?? []))

  const ready = this.ctx.taskQueue.filter(t => {
    if (t.status !== 'pending') return false
    if (!this.areDepsComplete(t)) return false

    // Ne pas lancer si une tâche en cours touche les mêmes fichiers
    const conflict = (t.fileScope ?? []).some(f => runningFiles.has(f))
    return !conflict
  })

  await Promise.allSettled(ready.map(t => this.dispatchTask(t)))

  const allSettled = this.ctx.taskQueue.every(
    t => ['complete', 'failed', 'skipped'].includes(t.status),
  )
  if (allSettled) this.transition('verifying')
}
```

Le `fileScope` est estimé par le Builder Agent lui-même lors du planning :

```typescript
// Dans phasePlanning — le Builder Agent inspecte la feature et déclare les fichiers
const taskPlan = await this.estimateFileScope(feature)
// → ["src/components/Dashboard.tsx", "src/api/projects.ts", "tests/dashboard.test.ts"]
task.fileScope = taskPlan.files
```

---

## Observabilité : structured logging + table agent_runs

### Logging JSON minimal (stdout)

Chaque appel agent émet un log JSON parseable :

```json
{
  "event":       "agent_call",
  "run_id":      "01HXXXXXX",
  "project_id":  "kap-platform",
  "agent_type":  "reporter",
  "sprint":      1,
  "iteration":   1,
  "model":       "claude-sonnet-4-5",
  "tokens_in":   1240,
  "tokens_out":  380,
  "cost_usd":    0.0094,
  "duration_ms": 1820,
  "ts":          "2026-05-14T18:00:00Z"
}
```

### Table PostgreSQL agent_runs

```sql
CREATE TABLE agent_runs (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id),
  agent_type   TEXT NOT NULL,
  sprint       INT,
  status       TEXT DEFAULT 'running', -- running | success | failed | budget_exceeded
  input        JSONB,
  output       JSONB,
  tokens_in    INT DEFAULT 0,
  tokens_out   INT DEFAULT 0,
  cost_usd     FLOAT DEFAULT 0,
  duration_ms  INT,
  error        TEXT,
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

Le dashboard Admin affiche le coût par sprint, le taux de succès par agent, les runs échoués. Pas de dépendance externe (Langfuse, Langsmith) pour le MVP.

---

## MCP : ajouter les Resources (complément aux Tools)

Les Resources MCP exposent des données lisibles sans appel actif. L'agent peut les parcourir comme des fichiers.

```typescript
// packages/mcp-server/src/resources.ts

export function registerResources(server: McpServer): void {
  server.resource(
    'pkg://decisions',
    'kap-pkg-decisions',
    'Les décisions architecturales et techniques du projet, ordonnées par date',
    async (uri) => {
      const projectId = extractProjectId(uri)
      const pkg = await getLocalPKG(projectId)
      const decisions = await pkg.getRecentDecisions(20)
      return {
        contents: [{
          uri: uri.toString(),
          mimeType: 'application/json',
          text: JSON.stringify(decisions, null, 2),
        }],
      }
    },
  )

  server.resource(
    'pkg://vision',
    'kap-project-vision',
    'La vision fondatrice du projet — décisions sprint 0/1 à haute confiance',
    async (uri) => {
      const pkg = await getLocalPKG(extractProjectId(uri))
      const vision = await pkg.getProjectVision()
      return {
        contents: [{
          uri: uri.toString(),
          mimeType: 'text/markdown',
          text: visionToMarkdown(vision),
        }],
      }
    },
  )

  server.resource(
    'pkg://signals',
    'kap-community-signals',
    'Signaux communautaires non traités, ordonnés par funding puis votes',
    async (uri) => {
      const pkg = await getLocalPKG(extractProjectId(uri))
      const signals = await pkg.getPendingSignals()
      return {
        contents: [{ uri: uri.toString(), mimeType: 'application/json', text: JSON.stringify(signals) }],
      }
    },
  )
}
```

L'agent peut maintenant écrire dans Claude Code :
```
Lis la resource pkg://decisions pour moi
```
Et voir directement les décisions du projet sans appeler un tool.

---

## Git intégration

### Niveau 1 — SDK hooks (requis, git-agnostic)

```bash
npm install @kap/sdk --save-dev
npx kap init
```

Installe `post-commit` + `post-push`. Fonctionne avec GitHub, GitLab, Gitea, Bitbucket, repo local.

### Niveau 2 — GitHub App (optionnel)

Ajoute sans modifier le SDK :
- Contexte PR (titre, description, reviewers, merge status)
- Résultats CI/CD (GitHub Actions)
- Lien issues ↔ features KAP
- Webhooks natifs (remplace les hooks si installé)

Configuration dans `kap.config.json` :
```json
{
  "github": {
    "repo": "user/my-project",
    "app_installation_id": "12345"
  }
}
```

### Pas de fork — décision ferme

Un projet KAP appartient à son Admin. Pas de fork sur la plateforme.

---

## Paiements

### LemonSqueezy — plans Builder

Merchant of Record : TVA UE collectée et reversée automatiquement.

```
Free   — 1 projet, updates manuelles
Pro    — $29/mois — projets illimités, agents complets, analytics
Team   — $99/mois — multi-admin, SLA, intégrations custom
```

Intégration : webhook LemonSqueezy → activation plan en PostgreSQL. Simple.

### Cagnottes MVP — pledges sans paiement

```
Backer déclare un pledge (email + montant + feature_id)
→ Stocké dans PostgreSQL (table pledges)
→ Feature livrée + Verifier PASS
→ Email automatique aux pledgers avec lien de paiement manuel
→ Paiement hors plateforme
```

Pas de PSP, pas de TVA sur les cagnottes en MVP.

### Cagnottes v1 — Stripe

Quand le volume le justifie :
- Stripe Payment Intents (capture différée = escrow)
- Stripe Tax pour la TVA (ou délégation à Stripe en MoR si volume EU important)
- Libération à `ProofBundle.status === 'pass'`
- Remboursement automatique si timeout ou fail

---

## Mémoire des agents : les quatre niveaux

| Type | Implémentation actuelle | Statut |
|---|---|---|
| **Working memory** | Context window Claude | ✓ natif |
| **Episodic** | Artifacts dans PKG (commits, deploys, runs) | ✓ implémenté |
| **Semantic** | Decisions, Constraints, Vision dans PKG | ✓ implémenté |
| **Procedural** | Conventions dans CLAUDE.md (manuel MVP) | ⚠ manuel pour MVP |

Mémoire procédurale v0.2 : nœud `ProcedureNode` dans le PKG avec `steps[]`, `applicable_when`, `success_rate` empirique basé sur les runs Verifier.

---

## State machine : acceptable pour MVP, évolue vers DAG

La state machine à 6 phases est correcte pour le MVP. Limites connues :

| Limite | Déclencheur | Solution v0.2 |
|---|---|---|
| Linéaire : un échec bloque tout le sprint | > 5 features par sprint | Partial recovery + skip |
| Pas de re-planning mid-sprint | Dépendances feature complexes | LangGraph DAG |
| Latence 5min sur signaux communautaires | Projects community-driven actifs | Event-driven tick (pas juste cron) |

---

## Docker Compose

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgresql://kap:${PG_PASSWORD}@postgres:5432/kap
      REDIS_URL: redis://redis:6379
      PORT: 3000
    # PAS de kuzu_data ici — API ne lit pas Kuzu directement
    depends_on: [postgres, redis]
    restart: unless-stopped

  platform:
    build:
      context: .
      dockerfile: apps/platform/Dockerfile
    environment:
      NEXT_PUBLIC_API_URL: ${API_URL}
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    environment:
      DATABASE_URL: postgresql://kap:${PG_PASSWORD}@postgres:5432/kap
      REDIS_URL: redis://redis:6379
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      KAP_DATA_DIR: /data/kuzu
      KAP_AGENT_BUDGET_USD: "1.00"    # hard cap par tâche
    volumes:
      - kuzu_data:/data/kuzu          # SEUL processus avec accès Kuzu
    depends_on: [postgres, redis]
    restart: unless-stopped
    deploy:
      replicas: 2

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: kap
      POSTGRES_USER: kap
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --save 60 1 --loglevel warning
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  caddy_data:
  kuzu_data:
  pg_data:
  redis_data:
```

---

## Roadmap technique

### MVP (v0.1) — à construire maintenant

- [ ] Worker process (BullMQ) avec RunBudget wrapper
- [ ] Reporter Agent déclenché sur events (git hooks → BullMQ → Reporter → PostgreSQL → SSE)
- [ ] Pages Next.js : page projet publique + feed SSE
- [ ] Table `agent_runs` + structured logging
- [ ] File scope isolation dans l'Orchestrateur
- [ ] MCP Resources (decisions, vision, signals)
- [ ] LemonSqueezy webhooks → activation plan
- [ ] Docker Compose prod + Caddyfile

### v0.2 — après validation

- [ ] Migration Kuzu → PostgreSQL + pgvector
- [ ] Embeddings via Voyage AI (semantic search réel)
- [ ] ProcedureNode dans le PKG (mémoire procédurale)
- [ ] GitHub App intégration
- [ ] Stripe cagnottes
- [ ] LangGraph DAG pour orchestration parallèle

### v1.0 — après traction

- [ ] Appels à projets (KAP détecte besoins → spawn Orchestrateur autonome)
- [ ] Multi-admin par projet
- [ ] API publique pour intégrations tierces

---

## Ce qui a changé vs. v1 de l'archi

| Avant | Après | Raison |
|---|---|---|
| Kuzu accès multi-process | Kuzu uniprocess strict (worker seul) | Data integrity |
| Aucune limite agent | RunBudget wrapper, hard cap $1/tâche | Production safety |
| Builders sans coordination | fileScope + conflict detection | Correctness multi-agent |
| MCP Tools uniquement | Tools + Resources | Ergonomie agent standard |
| Aucune observabilité | Structured logging JSON + agent_runs | Debug & coûts |
| Supabase Realtime | SSE via Fastify + Redis Pub/Sub | On-prem, zéro dépendance |
| Fly Machines | BullMQ workers | Simpler, même VPS |
| Stripe Connect | LemonSqueezy (SaaS) + pledges MVP | TVA auto, friction réduite |

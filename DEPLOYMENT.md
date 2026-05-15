# KAP — Architecture de Déploiement

> Mai 2026 — document de travail

---

## Vue d'ensemble

```
                         Internet
                             |
                    [Cloudflare CDN + WAF]
                             |
              ┌──────────────┴──────────────┐
              |                             |
     [platform.kap.io]              [api.kap.io]
          Vercel                      Fly.io
       (Next.js 15)                      |
       + Supabase                ┌───────┴────────┐
         Realtime                |                |
                          [API Service]   [Orchestrator
                           stateless       Machines]
                           auto-scale      stateful
                                           1 par projet
```

---

## Composants et où ils vivent

### 1. Platform — Vercel

**Ce que c'est :** Next.js 15, pages publiques des projets, dashboards Admin et Backer, Feature Board.

**Pourquoi Vercel :**
- SSR + ISR natif pour les pages projet (SEO critique pour l'acquisition)
- Edge Functions pour les routes API légères (auth, redirects)
- Déploiement zéro-config depuis le monorepo

**Realtime :** Supabase Realtime via WebSocket depuis le client. Le feed live des updates s'abonne à une channel par projet. L'API backend insère dans Supabase → Realtime pousse au client.

```
Visiteur → platform.kap.io (Vercel)
    |
    ├── Page projet (SSR) : métriques, pitch, changelog
    └── Feed live (Supabase Realtime WS) : updates en temps réel
```

---

### 2. API Service — Fly.io (stateless)

**Ce que c'est :** Fastify backend. Reçoit les events du SDK, gère les projets, orchestre les routes, sert les données à la plateforme.

**Pourquoi stateless ici :** L'API ne tient pas d'état — elle lit/écrit dans Supabase (PostgreSQL) et déclenche des Orchestrators. Elle peut scaler horizontalement sans coordination.

**Déploiement :** 2 instances minimum (HA), auto-scale à la charge. Fly.io regions : Europe (Paris) + US East.

```
SDK dev → POST api.kap.io/api/v1/events
    |
API Service → valide auth → écrit event dans Supabase
    |
    └── trigger Orchestrator Machine via message queue
```

---

### 3. Orchestrator Machines — Fly.io Machines (stateful, clé de voûte)

**C'est le composant le plus délicat du déploiement.**

Chaque projet actif a une **Fly Machine dédiée** :
- Stockage persistant : volume Fly attaché contenant le fichier Kuzu `.db` du PKG
- Cycle de vie : la machine est **suspendue entre les ticks** (coût ~$0 à l'arrêt)
- Elle se réveille sur trigger (queue message ou cron), exécute le tick (~30s-2min), se rendort

```
[Message queue] → réveil de la Machine du projet X
        |
[Orchestrator tick]
  ├── lit PKG (Kuzu sur volume local)
  ├── dispatche sous-agents (appels Claude API)
  ├── écrit résultats dans Supabase
  ├── écrit décisions dans PKG
  └── push update via Supabase → Realtime → visiteurs
        |
[Machine se rendort]
```

**Pourquoi Fly Machines et pas Lambda/serverless classique :**
- Lambda = stateless = pas de volume attaché = pas de Kuzu local
- Fly Machine = VM légère avec stockage persistant + lifecycle géré
- Une machine suspendue coûte ~$0.02/mois (juste le stockage du volume)

**Coût estimé par projet actif :**
```
Volume Fly 1GB (PKG Kuzu) : ~$0.15/mois
Machine active 2h/jour (ticks + agents) : ~$2/mois
Appels Claude API (Sonnet + Opus) : $5-20/mois selon activité
Total par projet actif : ~$7-22/mois
```

**Backup PKG :** dump Cypher quotidien → Supabase Storage (S3-compatible). Disaster recovery en cas de perte du volume.

---

### 4. Agent Runner — Fly.io (stateless, scale-to-zero)

**Ce que c'est :** Pool de workers qui exécutent les sous-agents (Builder, Reporter, Verifier, PO, Promoter) sur demande.

Les agents sont des fonctions stateless : ils reçoivent un input, appellent Claude API, retournent un output. Pas besoin de persistence locale.

**Déploiement :** Fly Machines qui démarrent à la demande depuis la queue et s'arrêtent après usage. Scale-to-zero quand aucun projet n'est actif.

```
Orchestrator → enqueue job (type: "reporter", input: {...})
        |
Agent Runner Machine démarre
        |
Appel Claude API (Anthropic)
        |
Résultat → Supabase → Realtime
        |
Machine s'arrête
```

**Isolation Verifier :** Le Verifier Agent tourne dans une Machine séparée sans accès au contexte du Builder. Implémenté via des jobs de type différent dans la queue — le Verifier ne reçoit jamais les logs ou la session du Builder.

---

### 5. KAP SDK — npm package (côté dev)

**Ce n'est pas un service hébergé.** C'est un package npm installé sur la machine du développeur ou dans le CI/CD du projet.

```
# Installation dans le projet du dev
npm install @kap/sdk

# kap.config.json
{
  "projectId": "proj_xxx",
  "apiToken": "kap_xxx",
  "apiUrl": "https://api.kap.io",
  "hooks": {
    "git": ["post-commit", "post-push"],
    "ci": true
  },
  "transparency": {
    "level": "backers",       // public | backers | contributors
    "excludePatterns": ["**/secrets/**"]
  }
}
```

Le SDK envoie des events HTTPS vers `api.kap.io`. Pas de serveur à héberger côté dev.

---

### 6. MCP Server — deux modes

**Mode 1 — Local (Modèle semi-auto)**

Le développeur installe le MCP server localement. Il tourne en stdio, se connecte à `api.kap.io` via HTTPS. L'agent de dev (Claude Code, Cursor...) appelle les tools MCP localement.

```
Claude Code (local)
    |
kap-server (stdio, local)
    |
HTTPS → api.kap.io
```

Installation dans `~/.claude/settings.json` :
```json
{
  "mcpServers": {
    "kap": {
      "command": "npx",
      "args": ["@kap/mcp-server"],
      "env": {
        "KAP_API_URL": "https://api.kap.io",
        "KAP_API_TOKEN": "kap_xxx"
      }
    }
  }
}
```

**Mode 2 — Côté plateforme (Modèle full-auto)**

L'Orchestrateur appelle directement l'API backend — pas de MCP server nécessaire côté plateforme. Le MCP est une interface pour les agents externes ; l'Orchestrateur interne utilise l'API directement.

---

## Infrastructure data

```
┌─────────────────────────────────────────────────────┐
│                    SUPABASE                         │
│                                                     │
│  PostgreSQL                                         │
│  ├── projects (id, adminId, config, status)         │
│  ├── events (projectId, type, payload, ts)          │
│  ├── updates (projectId, content, proofBundle)      │
│  ├── signals (projectId, type, votes, funding)      │
│  ├── features (projectId, status, AC, score)        │
│  ├── escalations (projectId, status, resolution)    │
│  └── backers (projectId, userId, email, amount)     │
│                                                     │
│  Realtime                                           │
│  └── channel par projet : updates, métriques        │
│                                                     │
│  Storage                                            │
│  ├── demos/ (screenshots, vidéos)                   │
│  └── pkg-backups/ (dumps Cypher quotidiens)         │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              Fly.io Volumes (par projet)            │
│  /data/{projectId}.db  ← Kuzu PKG                  │
│  ~50-200MB par projet actif                         │
└─────────────────────────────────────────────────────┘
```

---

## Queue / messaging

**Redis Streams via Upstash** (serverless Redis, pay-per-use) :

```
Stream: kap:events:{projectId}      ← events entrants du SDK
Stream: kap:jobs:{projectId}        ← jobs à dispatcher aux agents
Stream: kap:escalations             ← escalades Admin (tous projets)
```

L'API écrit dans les streams. Les Orchestrator Machines lisent leur stream au réveil. Les Agent Runners lisent le stream `jobs`.

Pas de RabbitMQ, pas de Kafka — Upstash Redis Streams couvre le besoin avec zero ops.

---

## Paiements — Stripe Connect

Stripe Connect Standard pour les cagnottes :
- Le Builder s'onboard via Stripe Connect (compte Stripe)
- Les Backers paient via Stripe Checkout (KAP comme plateforme)
- L'escrow est géré par Stripe Payment Intents avec capture différée
- Libération au `ProofBundle PASS` → capture du payment intent
- Remboursement si `FAIL` après timeout → annulation du payment intent

```
Backer paie → Stripe Checkout → Payment Intent (uncaptured)
        |
Verifier PASS → API KAP capture le Payment Intent
        |
Stripe → vire au Builder (moins commission KAP 5-8%)
```

---

## Environnements

| Env | URL | Usage |
|---|---|---|
| **Production** | `api.kap.io` / `platform.kap.io` | Projets réels, paiements réels |
| **Staging** | `api.staging.kap.io` / `staging.kap.io` | Tests d'intégration, Stripe test mode |
| **Preview** | `api.preview-{branch}.kap.io` | PR preview (Fly + Vercel) |
| **Local** | `localhost:3000` | Dev SDK, tests unitaires |

---

## Évolution du déploiement selon la charge

### Phase 0 — MVP (0-10 projets)
- 1 instance API (Fly, 256MB RAM)
- Orchestrators sur la même instance (pas de Machines séparées encore)
- Kuzu en mémoire + backup S3
- Supabase free tier
- Coût total : ~$50/mois

### Phase 1 — Early traction (10-100 projets)
- API auto-scale (2-5 instances)
- Orchestrators sur Fly Machines dédiées avec volumes
- Upstash Redis pour la queue
- Supabase Pro
- Coût total : ~$200-500/mois

### Phase 2 — Scale (100-1000 projets)
- Orchestrators → envisager migration vers Cloudflare Durable Objects (zero cold start, global)
- PKG → évaluer migration Kuzu → FalkorDB ou Neo4j Aura si cross-project queries nécessaires
- Agent Runner → pool dédié avec priorité par plan (Pro > Free)
- Coût total : ~$2000-8000/mois (largement couvert par les commissions à ce stade)

---

## Points de vigilance

**Cold start Orchestrator Machine**
Fly Machine qui se réveille = ~1-3s de cold start. Acceptable pour un tick toutes les 5 min. Si on passe à des réponses temps réel (< 1s), il faudra garder les machines actives (coût plus élevé).

**PKG volume et multi-région**
Fly volumes sont mono-région. Si l'Orchestrateur doit tourner en Europe ET en US, le volume ne peut pas être partagé. Solution : un projet = une région fixe, choisie à la création.

**Coût des appels LLM**
Claude Opus 4.7 à $15-75/MTok selon le plan. Un projet actif avec 20 tâches par sprint = ~$5-20/sprint en compute LLM. À monitorer et à intégrer dans la tarification des plans.

**Secrets et sécurité**
- API tokens SDK : format `kap_{projectId}_{secret}` — jamais loggés
- Stripe webhooks : validés via signature Stripe
- Supabase RLS : chaque projet n'accède qu'à ses propres données
- Kuzu files : chiffrés au repos sur les volumes Fly

---

*À mettre à jour à chaque décision d'infra structurante.*

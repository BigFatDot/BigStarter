# KAP — Rapport de Recherche Stack Technique

> Base de connaissance : février 2025 | Généré : mai 2026
> Points à valider marqués [VERIFY]

---

## Décisions tranchées

| Sujet | Décision | Raison |
|---|---|---|
| MCP SDK | `@modelcontextprotocol/sdk` TypeScript, serveur unique multi-tenant | Standard Anthropic, transport stdio, context isolation par `x-project-id` |
| Graph DB (PKG) | **Kuzu** embarqué (npm `@kuzu/kuzu`) | In-process, Cypher natif, vecteurs intégrés v0.2+, zéro infra sidecar |
| Orchestration | **State machine TypeScript natif** (pas LangGraph TS) | Explicite, testable, pas de dépendance externe, un orchestrateur par projet |
| Positionnement | "GitHub Stars → Financing" | Angle distribution le plus direct pour early adopters open-source |

---

## MCP SDK — Architecture multi-tenant

Un seul serveur MCP pour tous les projets. Isolation par `x-project-id` header.

```typescript
// Pattern multi-tenant : chaque tool reçoit le contexte projet
server.setRequestHandler((request) => {
  const tenantId = request.headers["x-project-id"]
  request.context = tenantStore.get(tenantId)
})
```

**6 tools critiques pour le MVP :**
`report_event`, `fetch_feedback`, `escalate_to_admin`,
`get_project_memory`, `write_project_memory`, `trigger_verification`

**À ne pas faire :**
- Pas de JWT complexe — Bearer token (projectId + apiKey) suffit
- Pas de streaming — rester bloquant pour l'orchestration
- Pas de serveur MCP par projet — une seule instance scalée horizontalement

[VERIFY] Anthropic a peut-être publié des patterns officiels multi-tenant dans le SDK depuis.

---

## Kuzu — Project Knowledge Graph

```typescript
import Kuzu from "kuzu"
const db = new Kuzu.Database(`./data/${projectId}.db`)
// Schéma + Cypher queries natifs
// ~50MB RAM par instance, backup quotidien → S3
```

**Avantages confirmés :** in-process, Cypher compatible Neo4j, support vecteurs v0.2+, isolation par projet (un fichier .db par projet).

**Alternatives rejetées :**
- Neo4j → HTTP round-trip, coût, overkill
- FalkorDB → Redis sidecar, alpha
- LlamaIndex Graph → orienté vecteur store pas graphe, overhead

[VERIFY] Kuzu aura probablement atteint v1.0 en mai 2026 — vérifier changelog.

---

## Orchestration — State Machine TypeScript

```
idle → planning → executing → verifying → reporting → waiting_community → planning
```

Chaque état = une phase du cycle projet. Tick toutes les 5 min ou sur event entrant.
Agent dispatch = appel Claude API avec tool use MCP.
Verifier Agent = session API **complètement isolée** du Builder (zéro contexte partagé).

Retry budget : 3 tentatives max par tâche, puis escalade Admin automatique.

---

## Competitive Landscape

| Concurrent potentiel | Timing | Impact KAP |
|---|---|---|
| Crypto/DAO alternative | Probablement émergé | Cibler marché différent (degen vs mainstream) |
| VC "Agentic Ops" platform | Possible | KAP = community ownership, pas top-down VC |
| GitHub native build-in-public | Possible | Complémentaire, pas concurrent direct |
| Agent-as-a-Service (Upwork agentique) | Probable | KAP = projets long terme, pas tâches ponctuelles |

**Fenêtre de lancement estimée :** 6-12 mois avant clonage sérieux. MVP avant septembre 2026.

---

## Go-to-market MVP

**Early adopters prioritaires :**
- Open-source creators avec 500-50K GitHub stars
- Indie hackers avec MVP fonctionnel cherchant financement + transparence
- Founders pre-seed sans VC

**Métrique de validation MVP v0.1 :**
- 5-10 projets pilotes (dont KAP lui-même en dogfood)
- 50+ backers par projet (email signup)
- Updates auto-générées lisibles et non-spam ← test critique du Reporter Agent

---

## Questions encore ouvertes

- [ ] Nom commercial (KAP = working title)
- [ ] Premier marché : open-source (viralité) ou indie startups (pouvoir d'achat) ?
- [ ] Curseur d'autonomie par défaut : Niveau 0 (safe/propose tout) ou Niveau 1 (exécute, reporte) ?

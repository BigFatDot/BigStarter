# KickStartering Agent Platform — Cadrage Concept

> Mai 2026 — document de travail, itératif

---

## Vision

**Une plateforme où tout projet — idée brute ou produit en cours de dev — est opéré par une équipe d'agents IA, publie son avancement en temps réel, attire une communauté, collecte son feedback, et s'adapte en continu. L'humain choisit jusqu'où il délègue.**

Un projet tech n'est plus une boîte noire entre deux updates manuelles — c'est un organisme vivant, observable, co-piloté par sa communauté et exécuté par des agents.

---

## Modèle unifié : l'Admin et le Curseur d'Autonomie

Il n'y a pas deux modèles distincts — il y a **un seul modèle avec un curseur**.

### L'invariant : l'Admin humain

Tout projet sur KAP a toujours un **Admin** à son origine — un humain qui soumet une idée, un concept, un produit. L'Admin est le porteur du projet. Il ne disparaît jamais complètement : c'est lui qui fixe les règles d'autonomie, qui détient la responsabilité contractuelle, et qui peut reprendre la main à tout moment.

Ce que l'Admin délègue à l'Orchestrateur Agent, c'est **l'opération** — pas la propriété.

### Le curseur d'autonomie

```
CONTRÔLE TOTAL                                        DÉLÉGATION TOTALE
      |                                                       |
  L'Admin             L'Admin                L'Admin      L'Orchestrateur
  décide tout         valide les             définit      opère seul,
  l'agent             grandes                les règles,  Admin notifié
  propose             décisions              l'agent      en cas
                                             exécute      d'escalade
      |_______________|_______________________|_____________|
     Niveau 0        Niveau 1               Niveau 2     Niveau 3
```

L'Admin configure ce curseur par domaine :
- Code / architecture → niveau X
- Communication / marketing → niveau Y
- Décisions de roadmap → niveau Z
- Dépenses / financement → niveau W

**En pratique** : un dev solo peut démarrer en niveau 1 (il valide les PRs mais l'agent gère tout le reste), puis progressivement passer en niveau 2-3 au fur et à mesure que la confiance s'établit avec l'agent et la communauté.

---

## L'Orchestrateur Agent : coeur du système

L'Orchestrateur est l'agent principal attaché à chaque projet. Il reçoit les directives de l'Admin, les inputs de la communauté, et coordonne une équipe de sous-agents spécialisés.

```
                        ┌─────────────┐
                        │    ADMIN    │
                        │  (humain)   │
                        └──────┬──────┘
                 configure     │  escalade si nécessaire
                 curseur       │
                        ┌──────▼──────────────────────────┐
                        │      ORCHESTRATEUR AGENT        │
                        │                                 │
                        │  - Maintient le plan projet     │
                        │  - Coordonne les sous-agents    │
                        │  - Arbitre les priorités        │
                        │  - Gère le cycle communautaire  │
                        └──┬──────┬──────┬───────┬────────┘
                           │      │      │       │
               ┌───────────▼┐  ┌──▼───┐ ┌▼────┐ ┌▼──────────┐
               │  BUILDER   │  │  PO  │ │REP. │ │ PROMOTER  │
               │  Agent(s)  │  │Agent │ │Agent│ │  Agent    │
               │            │  │      │ │     │ │           │
               │ code       │  │aggr. │ │pub. │ │ marketing │
               │ design     │  │feed. │ │upd. │ │ social    │
               │ tests      │  │prior.│ │demo │ │ SEO       │
               │ deploy     │  │brief │ │métr.│ │ outreach  │
               └────────────┘  └──────┘ └─────┘ └───────────┘
                                   ▲
                                   │ feedback structuré
                        ┌──────────┴──────────┐
                        │     COMMUNAUTÉ      │
                        │                     │
                        │  votes / cagnottes  │
                        │  feature requests   │
                        │  commentaires       │
                        │  sondages           │
                        └─────────────────────┘
```

### Les sous-agents

**Builder Agent(s)** — exécutent le travail : code, design, contenu, tests, déploiement. Peuvent être plusieurs en parallèle sur des tâches indépendantes. Dans un projet sans dev humain, c'est eux qui "construisent" le produit.

**PO Agent (Product Owner)** — agrège le feedback communautaire, déduplique, score les demandes (votes × montant × sentiment × alignement plan), génère des briefs actionnables pour l'Orchestrateur.

**Reporter Agent** — traduit l'avancement technique en langage humain, publie les updates sur la page projet, génère des démos, screenshots, métriques. Aucune update n'est rédigée manuellement.

**Promoter Agent** — gère la présence publique du projet : landing page, réseaux sociaux, SEO, outreach ciblé pour attirer des backers. Fonctionne dans les limites définies par l'Admin.

---

## Le cycle de vie d'un projet sur KAP

### Étape 1 — Soumission

L'Admin soumet son projet : pitch, description, stack technique (optionnel), niveau d'autonomie désiré. KAP génère automatiquement une page publique minimale et attache un Orchestrateur.

Deux types de soumission :
- **Projet existant** : SDK branché sur un repo existant, l'Orchestrateur prend le contexte du code et de l'historique
- **Idée brute** : Pas de code encore. L'Orchestrateur démarre de zéro et peut construire le produit lui-même si l'Admin le délègue

### Étape 2 — Lancement communautaire

Le Promoter Agent active la page publique, pousse sur les canaux configurés, crée les premiers contenus d'attraction. L'objectif : attirer des early adopters qui vont suivre et co-orienter le projet.

### Étape 3 — Cycle de développement

```
[Plan projet]
      |
[Orchestrateur décompose en sprints]
      |
[Builder Agent(s) exécutent]
      |
[Reporter Agent publie l'avancement]
      |
[Communauté réagit : votes, feedback, cagnottes]
      |
[PO Agent agrège → brief → Orchestrateur]
      |
[Orchestrateur adapte le plan]
      |
[→ retour au début]
```

Ce cycle tourne en continu. L'Admin intervient selon son niveau d'autonomie configuré.

### Étape 4 — Déclencheurs de validation

Certaines actions exigent toujours un signal humain, quel que soit le niveau d'autonomie :
- Changement architectural majeur
- Dépense financière au-delà d'un seuil
- Publication d'une feature en production
- Décision de pivotement de produit

Ce sont les **points d'escalade** — l'Orchestrateur notifie l'Admin et attend son signal avant de continuer.

---

## Le second cycle : les Appels à Projets

La plateforme elle-même peut générer des opportunités de manière autonome.

```
[KAP agrège les signaux de la communauté globale]
  - "beaucoup de gens cherchent un outil X, personne ne le construit"
  - "une tendance émergente détectée sur Y"
  - "une feature très demandée sur plusieurs projets similaires"
        |
[KAP génère un Appel à Projet]
  - Description du besoin détecté
  - Estimation de la demande (votes, recherches)
  - Budget communautaire estimé disponible
        |
[L'Appel est publié]
        |
[Deux chemins possibles]
    |                        |
[Un Admin existant]     [KAP spawn un]
[répond et revendique]  [Orchestrateur autonome]
[le projet]             [si seuil de financement]
                        [communautaire atteint]
```

Ce second cycle transforme KAP en **place de marché de besoins** — pas seulement un outil pour les devs qui ont déjà un projet, mais un système qui identifie des besoins non satisfaits et les connecte à des capacités de réalisation (humaines ou agentiques).

---

## Ce qui est techniquement optimal aujourd'hui (Mai 2026)

### Ce qui est mature et fiable

**MCP comme colonne vertébrale** — le protocole est stable, l'adoption est large, tous les agents majeurs le supportent. C'est le bon choix pour l'interface SDK ↔ backend.

**Orchestration multi-agents** — les frameworks d'orchestration (Claude Code avec sous-agents, LangGraph, frameworks internes) permettent des pipelines fiables sur des tâches bien définies et bornées. L'Orchestrateur + sous-agents spécialisés est faisable maintenant.

**Génération de contenu éditorial** — Reporter et Promoter Agents : trivial. Résumés, changelogs, posts réseaux sociaux, landing pages — qualité production sans supervision.

**Agrégation et priorisation de feedback** — PO Agent : faisable avec de bons prompts et un schéma de données propre.

**CI/CD automatisé + déploiement** — Builder Agent peut livrer des features bornées de manière fiable si le projet a une bonne couverture de tests et une architecture claire.

### Ce qui est possible mais nécessite des garde-fous

**Décisions architecturales autonomes** — un agent peut proposer et implémenter, mais une revue humaine reste recommandée pour les changements structurants. Niveau 2 max, pas niveau 3 pour ce domaine.

**Qualité de livraison sans revue** — acceptable pour des features isolées, risqué sur des systèmes complexes avec effets de bord. Nécessite une suite de tests robuste et un agent de vérification dédié.

**Gestion financière autonome** — possible techniquement (Stripe API), mais les points d'escalade humains sont non-négociables ici.

### Ce qui est encore fragile

**Compréhension de l'intention à long terme** — un agent peut dériver du cap initial sur des projets longs. Nécessite un système de mémoire de projet et des checkpoints réguliers de réalignement avec l'Admin.

**Détection de dégradation qualité** — un agent qui "finit" une tâche sans vraiment la finir. Nécessite un Verifier Agent indépendant du Builder.

**Interaction communautaire naturelle** — répondre à des commentaires ouverts de manière convaincante sans paraître robotique. Faisable mais détectable — à gérer avec transparence ("ce projet est opéré par des agents IA").

---

## Positionnement

| Existant | Problème |
|---|---|
| Kickstarter / Indiegogo | Updates manuelles, opacité totale |
| GitHub Sponsors | Transparent mais illisible pour les non-devs |
| Product Hunt | Snapshot unique, pas de suivi |
| Patreon | Modèle créateur, pas produit tech |
| Linear / Jira public | Trop granulaire, pas de narration ni financement |
| Devin / Cognition | Exécution uniquement, pas de plateforme communautaire |

**KAP** = la première plateforme où un projet est à la fois **opéré par des agents** et **co-piloté par sa communauté**, avec un humain qui choisit son niveau d'implication.

---

## Personas

### L'Admin — porteur de projet
- Peut être un dev (projet existant) ou un non-dev (idée brute)
- Cherche à valider et financer son idée sans gérer l'opération au quotidien
- Configure son niveau d'autonomie selon sa confiance et ses contraintes
- Reste responsable légalement et financièrement

### Le Backer / Early Adopter
- Suit des projets en construction, veut influencer la direction
- Vote sur les features, peut financer via cagnottes
- Apprécie la transparence radicale sur l'avancement réel

### Le Contributeur Communautaire
- Propose des idées, répond aux sondages, commente
- Peut devenir Admin s'il répond à un Appel à Projet

### L'Investisseur / Observateur
- Suit plusieurs projets, cherche des métriques objectives
- Utilise KAP pour due diligence sur l'avancement réel vs. annoncé

---

## Architecture technique

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────┐
│              ENVIRONNEMENT DEV (optionnel)          │
│  Repo git + CI/CD + outils dev                      │
│       |                                             │
│  KAP SDK (hooks git, events agent, CI webhooks)     │
└──────────────────────┬──────────────────────────────┘
                       |
┌──────────────────────▼──────────────────────────────┐
│              KAP MCP SERVER                         │
│  outils : report_event, fetch_feedback,             │
│           trigger_vote, publish_demo,               │
│           get_backlog, escalate_to_admin            │
└──────────────────────┬──────────────────────────────┘
                       |
┌──────────────────────▼──────────────────────────────┐
│                  KAP BACKEND                        │
│                                                     │
│  Orchestrateur par projet                           │
│  ├── Builder Agent pool                             │
│  ├── PO Agent                                       │
│  ├── Reporter Agent                                 │
│  ├── Promoter Agent                                 │
│  ├── Verifier Agent                                 │
│  └── Escalation Manager (→ Admin)                   │
│                                                     │
│  Services transverses :                             │
│  ├── Event Processor                                │
│  ├── Community Aggregator                           │
│  ├── Project Memory Store                           │
│  ├── Payment Service (Stripe Connect)               │
│  └── Notification Service                           │
└──────────────────────┬──────────────────────────────┘
                       |
┌──────────────────────▼──────────────────────────────┐
│               PLATEFORME PUBLIQUE                   │
│                                                     │
│  Page projet : pitch, avancement, feed, métriques   │
│  Feature Board : votes, cagnottes, statuts          │
│  Appels à Projets : besoins détectés par KAP        │
│  Dashboard Admin : contrôle, escalades, analytics   │
│  Dashboard Backer : projets suivis, contributions   │
└─────────────────────────────────────────────────────┘
```

### Stack recommandée

| Couche | Choix | Raison |
|---|---|---|
| MCP Server | TypeScript (SDK MCP officiel) | Standard de l'écosystème |
| Backend | Node.js + Fastify | Async, rapide, adapté aux events |
| Agents | Claude API (Sonnet 4.6 / Opus 4.7) | Capacités orchestration, tool use |
| BDD | Supabase (PostgreSQL + Realtime) | Realtime pour le feed live |
| Paiements | Stripe Connect | Marketplace payments, escrow |
| Plateforme | Next.js 15 + Tailwind | SSR, App Router, DX |
| Infra | Railway ou Fly.io | Simple, scalable, sans ops |

---

## Modèle économique

| Source | Mécanique |
|---|---|
| Commission cagnottes | 5-8% sur les montants libérés à la livraison |
| KAP Pro (Admin) | $49/mois — agents avancés, analytics, niveaux d'autonomie élevés |
| KAP Enterprise | $299/mois — privé, SLA, SSO, agents custom |
| Compute markup | Marge sur le coût LLM des agents pour les projets full-auto |
| Boost visibilité | Mise en avant de projets / appels à projets |

SDK core et MCP server : open source. Backend et plateforme : propriétaires.

---

## MVP — Ce qu'on construit en premier

### Objectif MVP
Valider que : (1) le SDK se branche sans friction, (2) les updates auto-générées créent de l'engagement, (3) une communauté se forme autour d'un projet en construction.

### Scope MVP v0.1
- KAP SDK Node.js : hooks git (post-commit, post-push) + webhook GitHub Actions
- Reporter Agent : commit → update éditoriale → publiée sur la page projet
- Page projet publique : pitch, feed d'updates, compteur backers (email signup)
- Dashboard Admin minimal : historique des updates, toggle pause/active
- Pas de cagnotte, pas de votes, pas de Builder Agent autonome
- 3-5 projets pilotes dont KAP lui-même (dogfooding)

### Ce qu'on apprend avec le MVP
- Est-ce que les updates générées sont lisibles et crédibles ?
- Est-ce que des gens s'inscrivent pour suivre un projet inconnu ?
- Quel niveau de granularité d'update est le bon (trop fréquent = bruit, trop rare = mort) ?

### MVP v0.2 (si v0.1 validé)
- Feature Board avec votes
- PO Agent basique (top requests de la semaine → brief Admin)
- Promoter Agent minimal (post automatique sur un réseau configuré)
- Système de cagnotte via Stripe

---

## Questions ouvertes

- [ ] Nom commercial (KAP = working title)
- [ ] Transparence par défaut : comment on certifie qu'une update reflète la réalité ? (Verifier Agent + hash de commit signé ?)
- [ ] Responsabilité légale dans le cas full-auto : contrat entre KAP et l'Admin, PAS entre la communauté et les agents
- [ ] Premier marché : indie hackers open source (viralité) ou startups early stage (pouvoir d'achat) ?
- [ ] Intégration Claude Code native en priorité ou protocole générique d'abord ?
- [ ] Modèle de confiance communautaire : comment éviter que les backers se sentent "trompés" par un agent ?

---

*Document à mettre à jour à chaque décision structurante.*

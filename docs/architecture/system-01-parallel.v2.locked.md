# System 01: Parallel — Architecture Review V2 (LOCKED)

> **Status: CANONICAL LOCK (V2).** Approved by the user ("Studio Head") exactly as presented, with the four cognitive domains kept as Market / Talent / Industry / Strategic. Saved verbatim 2026-08-12; ASCII diagrams preserved in code blocks; formatting lightly normalized from chat paste. Per the locking rule, this full reviewed plan is the canonical artifact; any summary is convenience only.

## Architecture Review V2 — System 01: Parallel

### 0. System identity

Proposed name: **Genesis OS — Signal Intelligence**
Department: External Intelligence
Partner: Parallel

Primary capability:

> Continuously discover, verify, contextualize, and evaluate external signals that could affect the studio's strategy.

I prefer Signal Intelligence over "External Intelligence Bureau." It sounds like an actual platform capability and fits the Genesis OS naming scheme better.

Studio Head question:

> "What is happening outside the studio that should change what we do?"

Lock candidate:

```
SYSTEM: Genesis OS — Signal Intelligence
FUNCTION: External Intelligence
PARTNER: Parallel
MISSION: Detect and evaluate external signals relevant to studio strategy.
```

My recommendation: LOCK.

### 1. Executive Agent

The Executive Agent should not research everything itself. Its job is to manage the intelligence objective.

Executive Agent responsibilities:

```
Signal Intelligence Executive
│
├── Interpret Studio Head objective
├── Determine intelligence scope
├── Decompose research objective
├── Assign cognitive domains
├── Manage research lifecycle
├── Evaluate synthesis
├── Resolve competing findings
├── Determine confidence
├── Produce strategic assessment
└── Present recommendation to Studio Head
```

It essentially becomes the intelligence mission commander.

Example: "Find emerging production companies worth monitoring." becomes:

```
Objective
↓
Define criteria
↓
Discover candidates
↓
Research candidates
↓
Verify evidence
↓
Build knowledge
↓
Evaluate strategic relevance
↓
Rank candidates
↓
Generate recommendation
```

**Decision — LOCK: Executive Agent owns the intelligence objective, not the individual searches.**

### 2. Specialist Agent Organization

I recommend four domain cognition groups, with specialist agents beneath them.

```
Signal Intelligence Executive
│
├── Market Intelligence
│   ├── Audience Agent
│   ├── Distribution Agent
│   └── Market Trend Agent
│
├── Talent Intelligence
│   ├── Creator Agent
│   ├── Talent Agent
│   └── Production Company Agent
│
├── Industry Intelligence
│   ├── Competitor Agent
│   ├── Technology Agent
│   └── Industry Development Agent
│
└── Strategic Intelligence
    ├── Opportunity Agent
    ├── Threat Agent
    ├── Strategic Fit Agent
    └── Blind Spot Agent
```

But there is an important architectural distinction: **these are cognitive roles, not necessarily 13 permanently running processes.** The runtime can instantiate only the agents required by the objective. That keeps the architecture sophisticated without creating pointless infrastructure.

**Decision — LOCK the four-domain cognitive organization.**

### 3. Nested cognition

This is where I think Genesis OS starts becoming genuinely distinctive. The hierarchy should be:

```
Studio Cognition
│
▼
Signal Intelligence Cognition
│
├── Market Cognition
├── Talent Cognition
├── Industry Cognition
└── Strategic Cognition
    │
    ├── Opportunity Cognition
    ├── Threat Cognition
    ├── Fit Cognition
    └── Blind-Spot Cognition
```

And individual intelligence missions create another level:

```
Strategic Cognition
│
▼
Intelligence Objective
│
▼
Research Context
│
▼
Research Task
│
▼
Evidence
```

So cognition isn't just: Agent → Agent → Agent. It's: **organizational context → domain context → objective context → task context.** That's the nested cognition model.

Critical rule: Lower-level cognition inherits constraints and relevant context downward. Validated findings propagate upward. But lower-level agents do not automatically inherit everything. That gives us scoped cognition.

**Decision — LOCK nested cognition as a first-class architectural principle.**

### 4. DataHub's role

This one needs to be precise. We are using DataHub as the context/knowledge graph and metadata/provenance plane, not pretending DataHub is our entire memory architecture.

For Signal Intelligence:

```
                DataHub
                   │
   ┌───────────────┼────────────────┐
   ▼               ▼                ▼
Knowledge       Context        Provenance
   │               │                │
   └───────────────┼────────────────┘
                   ▼
            Agent Cognition
```

The graph contains entities such as: Person, Company, Project, IP, Trend, Market, Event, Signal, Source, Evidence, Observation, Finding, Recommendation, Intelligence Objective.

Relationships become extremely valuable:

```
Person ──works_for──> Company
Company ──produces──> Project
Project ──belongs_to──> Genre
Trend ──affects──> Market
Signal ──supports──> Finding
Evidence ──supports──> Signal
Source ──produced──> Evidence
Finding ──supports──> Recommendation
Objective ──generated──> Finding
```

This gives us institutional intelligence about the external world.

**Decision — LOCK DataHub as the durable knowledge/context/provenance graph for Signal Intelligence.**

### 5. Evidence model

This is important enough to formalize. We need:

```
Source
↓
Observation
↓
Evidence
↓
Claim
↓
Finding
↓
Recommendation
```

For example:

```
Parallel Search
↓
Article / webpage / document
↓
Observed statement
↓
Evidence
↓
"Company X received funding"
↓
Verified Claim
↓
"Company X is expanding aggressively"
↓
Strategic Finding
↓
"Monitor Company X as an emerging competitor"
```

Each evidence object should carry things like: source, timestamp, retrieval timestamp, source type, claim, supporting content/reference, confidence, verification status, related entities, provenance.

This makes the system able to answer: **"Why do you believe this?"** That is much more valuable than simply showing a confidence score.

**Decision — LOCK explicit evidence → claim → finding → recommendation lineage.**

### 6. Verification

Parallel finds things. It does not automatically make them true. So we introduce verification cognition.

```
Discovery
↓
Candidate Evidence
↓
Verification Agent
├── corroboration
├── source quality
├── recency
├── contradiction detection
└── claim consistency
↓
Validated / Unverified / Conflicted
```

I would use three primary states:

- **VERIFIED** — Multiple strong signals or sufficiently authoritative evidence.
- **UNVERIFIED** — Plausible but insufficient evidence.
- **CONFLICTED** — Credible sources disagree.

And critically: **conflicted evidence does not get silently resolved by Gemini.** The system preserves the disagreement. That's enterprise-grade behavior.

**Decision — LOCK explicit verification states.**

### 7. Parallel integration

This is where we satisfy the hackathon requirement elegantly. Parallel becomes the external discovery and research substrate.

```
Genesis Executive Agent
│
▼
Research Planner
│
▼
Parallel Search
│
▼
External Evidence
│
▼
Verification
```

The agent should dynamically construct searches rather than having hardcoded queries. For example — Objective: Find emerging production companies. Research Planner: → identify candidate companies → research company → research leadership → research projects → research funding → research competitive positioning. Then Parallel performs the actual external retrieval.

**Decision — LOCK Parallel as a required runtime capability, not a supplementary search box.**

### 8. Gemini's role

Gemini should own the cognitive work, while Parallel owns external retrieval.

- **Gemini:** interprets objectives, plans research, decomposes missions, selects specialists, synthesizes evidence, identifies contradictions, reasons over the knowledge graph, evaluates strategic relevance, generates recommendations.
- **Parallel:** searches, retrieves, grounds external research.
- **DataHub:** represents durable knowledge/context, represents relationships, preserves provenance.

This creates a clean division: **Gemini = Cognition. Parallel = External Observation. DataHub = Knowledge + Context + Provenance.**

**Decision — LOCK.**

### 9. Google Cloud

For the hackathon MVP, I'd keep the Google Cloud architecture relatively tight.

- Core: **Gemini on Google Cloud / Agent Platform** for the cognitive layer.
- Hosting/runtime: **Cloud Run** for the application services.
- Identity: **Google Cloud IAM** for service authorization.
- Secrets: **Secret Manager** for API credentials.
- Observability: **Cloud Logging / Cloud Monitoring** for infrastructure-level visibility.
- Potentially: **Pub/Sub** for asynchronous intelligence events.

```
              Google Cloud
                   │
  ┌────────────────┼────────────────┐
  ▼                ▼                ▼
Gemini         Cloud Run         Pub/Sub
  │                │                │
  └────────────────┼────────────────┘
                   │
          Signal Intelligence
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
   Parallel                 DataHub
```

**Decision — LOCK this as the initial Google Cloud substrate. We can expand the production architecture later.**

### 10. Memory

This needs a distinction. I propose three memory classes.

- **Working memory** — Current intelligence mission: objective, tasks, current evidence, agent state, intermediate conclusions. Temporary.
- **Episodic memory** — Previous intelligence missions. "We researched Company X last month." Useful for detecting changes.
- **Institutional knowledge** — Durable validated knowledge represented through DataHub (Company X: people, projects, markets, events, relationships).

So: Working Memory → Episodic Memory → Institutional Knowledge. **But not everything graduates.**

**Decision — LOCK three-tier memory model.**

### 11. Human boundary

The Studio Head is the final authority.

Signal Intelligence may do **automatically**: search, research, verify, build knowledge, rank opportunities, generate recommendations, monitor existing intelligence subjects.

**Requires authorization**: contacting a company, contacting talent, initiating acquisition activity, sending communications externally, committing money, creating contractual obligations, changing strategic plans.

Therefore:

```
Intelligence
↓
Recommendation
↓
Studio Head
↓
Approve / Reject / Request More Research
```

**Decision — LOCK.**

### 12. Failure handling

We need four major failure states.

- **Tool failure** (Parallel unavailable): Retry → Backoff → Alternate permitted retrieval strategy → Mark intelligence incomplete. But we should not silently fabricate missing information.
- **Evidence conflict**: Conflict detected → Preserve both claims → Attempt additional research → If unresolved → CONFLICTED.
- **Low evidence**: The system should explicitly say "Insufficient evidence" rather than manufacture certainty.
- **Agent failure**: The Executive Agent can detect failure → retry → reassign task → reduce scope → escalate.

**Decision — LOCK.**

### 13. Security model

Every agent gets a scoped identity and permission boundary.

```
Studio Head
│
▼
Executive Agent
│
├── Research permissions
├── Knowledge permissions
└── Recommendation permissions
```

Specialists should not automatically have execution permissions. Example:

- **Research Agent**: READ external data; WRITE research artifacts; NO external actions.
- **Recommendation Agent**: READ evidence; READ knowledge; WRITE recommendations; NO external actions.
- **Execution Agent**: READ approved recommendation; EXECUTE authorized operation.

This creates separation of duties.

**Decision — LOCK scoped permissions + human authorization + audit trail.**

### 14. Event model

Signal Intelligence should emit events such as: `signal.discovered`, `evidence.created`, `claim.verified`, `claim.conflicted`, `knowledge.updated`, `finding.created`, `opportunity.detected`, `threat.detected`, `recommendation.created`, `intelligence.completed`.

Other Genesis systems can eventually subscribe. That gives us the bridge into the larger OS. For example:

```
Parallel
│
│ opportunity.detected
▼
Genesis Control Plane
│
├──→ ClickHouse
├──→ IBM
├──→ Replit
└──→ Grafana
```

We do not need to implement all of that inside Parallel MVP. But the event contracts should be designed now.

**Decision — LOCK event-driven interoperability.**

### 15. MVP versus production

Here's where I'm deliberately not cutting the architecture down too aggressively. You said you want to build the whole thing. Fine. But the distinction is:

**MVP:**

```
Studio Head
↓
Signal Executive
↓
Research Planner
↓
Parallel
↓
Verification
↓
DataHub
↓
Strategic Analysis
↓
Recommendation
```

One excellent intelligence mission.

**Production adds:** continuous monitoring, event bus, scheduled intelligence, persistent episodic memory, change detection, multiple intelligence domains, advanced authorization, agent lifecycle management, cross-system cognition, automated escalation.

The architecture doesn't need to be thrown away when the MVP is finished. That's the important part.

### 16. The 3-minute demo

I think this should be much more cinematic than "ask a question and watch agents search."

Opening — Studio Head sees: **"EXTERNAL WORLD — 47 NEW SIGNALS"**. Then: "3 potentially material developments detected." The Studio Head opens Signal #1: Emerging production company. The system shows:

```
DISCOVERED
↓
RESEARCHED
↓
7 SOURCES
↓
5 VERIFIED CLAIMS
↓
2 CONFLICTS RESOLVED
↓
STRATEGIC IMPACT: HIGH
```

Then the Studio Head asks: "Why should I care?" — Gemini explains the reasoning using the evidence graph. Then: "What happens if we ignore it?" — The system performs a strategic assessment. Then: "What do you recommend?" And the final panel:

```
RECOMMENDATION
Monitor → Engage → Evaluate acquisition potential
Confidence: 87%
Evidence: ██████████████████░░
Strategic rationale: ...
Studio Head authorization required.
```

That's the moment. The viewer sees Parallel, Gemini, DataHub, verification, nested cognition, evidence, reasoning, and human authority all operating as one system.

### 17. Repository architecture

```
genesis-parallel/
│
├── app/
│   ├── api/
│   ├── agents/
│   │   ├── executive/
│   │   ├── market/
│   │   ├── talent/
│   │   ├── industry/
│   │   ├── strategic/
│   │   ├── research/
│   │   └── verification/
│   │
│   ├── cognition/
│   │   ├── context/
│   │   ├── objectives/
│   │   ├── reasoning/
│   │   └── decision/
│   │
│   ├── knowledge/
│   │   ├── datahub/
│   │   ├── entities/
│   │   ├── relationships/
│   │   └── provenance/
│   │
│   ├── memory/
│   │   ├── working/
│   │   ├── episodic/
│   │   └── institutional/
│   │
│   ├── tools/
│   │   ├── parallel/
│   │   └── google/
│   │
│   ├── workflows/
│   ├── events/
│   ├── governance/
│   └── models/
│
├── frontend/
│
├── infrastructure/
│   ├── cloud-run/
│   ├── iam/
│   ├── pubsub/
│   └── secrets/
│
├── tests/
│
├── docs/
│   ├── architecture/
│   ├── agent-contracts/
│   └── decisions/
│
├── LICENSE
├── README.md
└── pyproject.toml
```

This is intentionally architecture-first.

### 18. The final Parallel architecture

```
STUDIO HEAD
│
▼
SIGNAL INTELLIGENCE EXECUTIVE
│
Intelligence Objective
│
▼
RESEARCH PLANNER
│
┌───────────────┼───────────────┐
▼               ▼               ▼
MARKET        TALENT        INDUSTRY
COGNITION    COGNITION      COGNITION
│               │               │
└───────────────┼───────────────┘
                ▼
         PARALLEL SEARCH
                │
                ▼
          RAW EVIDENCE
                │
                ▼
       VERIFICATION COGNITION
                │
      ┌─────────┼─────────┐
      ▼         ▼         ▼
  VERIFIED  CONFLICTED  UNVERIFIED
      │         │         │
      └─────────┼─────────┘
                ▼
          DATAHUB GRAPH
                │
      ┌─────────┴─────────┐
      ▼                   ▼
   CONTEXT            KNOWLEDGE
      │                   │
      └─────────┬─────────┘
                ▼
        STRATEGIC COGNITION
                │
┌───────────────┼───────────────┐
▼               ▼               ▼
OPPORTUNITY   THREAT       BLIND SPOT
│               │               │
└───────────────┼───────────────┘
                ▼
      STRATEGIC RECOMMENDATION
                │
                ▼
           STUDIO HEAD
                │
       ┌────────┴────────┐
       ▼                 ▼
    APPROVE           REJECT
       │
       ▼
    EXECUTE
       │
       ▼
    MONITOR
       │
       ▼
  NEW SIGNAL/EVENT
       │
       └───────────────→ (loop)
```

**Assessment:** This one is strong enough to freeze. More importantly, it establishes several architectural rules that should carry into the other four systems:

1. Executive agents manage objectives, not individual tool calls.
2. Agents represent cognitive responsibility, not merely software functions.
3. Cognition is hierarchical and scoped.
4. DataHub provides the durable knowledge/context/provenance graph.
5. Evidence is distinct from knowledge.
6. Discovery is distinct from verification.
7. Recommendations are distinct from execution.
8. Human authority remains above consequential actions.
9. Systems communicate through events and structured contracts.
10. Every action produces observable consequences that can become new context.

That gives us the first locked architectural cell of Genesis OS.

### Lock record

User approval (verbatim): "I approve and LOCK System 01: Genesis OS — Signal Intelligence (Parallel) exactly as presented. … keep the four major cognitive domains exactly as Market, Talent, Industry, and Strategic."

Convenience lock summary (non-canonical): Executive Agent owns objectives; four cognitive domains (Market/Talent/Industry/Strategic) instantiated dynamically per objective; nested scoped cognition; DataHub = durable knowledge/context/lineage substrate; evidence lineage Source→Observation→Evidence→Claim→Finding→Recommendation; three verification states with conflicts preserved; Parallel Search API as required runtime discovery substrate; Gemini = cognitive engine; Google Cloud substrate = Vertex/Agent Platform + Cloud Run + IAM + Secret Manager + Logging/Monitoring + Pub/Sub; three-tier memory; human authority boundary; graceful failure modes; scoped agent identities with separation of duties; event model; architecture-first `genesis-parallel/` repository.


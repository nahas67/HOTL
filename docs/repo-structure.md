> Source design extracted from the user-supplied build prompt. Read [implementation notes](implementation-notes.md) for the actual runtime contract, deliberate corrections, and remaining production work. This section describes the target; it is not a claim that a production deployment exists.

## 8. Suggested Repo Structure

```
.
├── AGENTS.md
├── .codex/
│   ├── config.toml
│   └── agents/
│       ├── repo-scaffolder.toml
│       ├── commerce-core-builder.toml
│       ├── guardrail-builder.toml
│       ├── orchestration-builder.toml
│       ├── cockpit-builder.toml
│       ├── infra-devops.toml
│       └── qa-tester.toml
├── docs/
│   ├── langgraph-design.md      # Section 5
│   ├── guardrail-api.md         # Section 6
│   ├── cockpit-schema.md        # Section 7
│   └── repo-structure.md        # this section
├── apps/
│   ├── commerce-core/           # MedusaJS
│   ├── orchestrator/            # LangGraph.js service
│   ├── guardrail-service/       # deterministic middleware
│   ├── cockpit/                 # Next.js owner dashboard
│   └── storefront/              # Next.js public storefront
├── packages/
│   └── schemas/                 # shared Zod types/contracts
└── infra/
    ├── docker-compose.yml
    ├── litellm-config.yaml
    └── kill-switch/             # deployed separately from everything above
```

---


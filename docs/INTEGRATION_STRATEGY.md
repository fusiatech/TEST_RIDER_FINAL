# Integration-First Implementation Strategy

**Phase 1 Deliverable**  
**Date:** 2025-02-26

---

## Principle

Build on what is already there. Wire existing modules before adding new ones. Avoid duplicate implementations.

---

## Priority Order

### 1. Wire Orphaned Modules (Phases 2–5)

| Module | Current | Action |
|--------|---------|--------|
| pipeline-engine | Exists, not imported | Import in orchestrator; use for scheduler/background jobs |
| anti-hallucination | Exists, not imported | Import; use analyzeStageOutputs, selectBestOutput, shouldRerunValidation |
| Attachments | UI + schema, not sent | Extend EnqueueSchema; pass to prompt builder |
| MCP | Config only | Spawn servers from settings; pass to CLI context |

**Rationale:** These are high-value, low-risk. No new architecture.

### 2. Extend Ticket System (Phases 6, 10)

- Add subatomic level; enforce hierarchy in TicketManager.
- Add retryCount; auto-create escalation ticket on 3rd failure.
- Link evidence to tickets.

**Rationale:** Ticket system is central; non-technical users need clear hierarchy and escalation.

### 3. Evidence Ledger (Phases 7–9)

- Schema → storage → attach to actions → Proof tab → re-run.
- Incremental: start with branch, commit, diff; add CLI excerpts, test IDs later.

**Rationale:** Anti-hallucination by design; required for Explain mode and audit.

### 4. Two Orchestration Units (Phases 11–12)

- Formalise: DeterministicWorkflowOrchestrator (pipeline-engine + scheduler) vs AgenticOrchestrator (current).
- Add pipeline templates (CI, deploy, report).

**Rationale:** Plan explicitly requires both; pipeline-engine already exists.

### 5. Testing Infrastructure (Phases 13–16)

- Vitest → Playwright → Testing dashboard → quality gates.
- Wire testingConfig to security checks.

**Rationale:** No tests today; quality gates and Proof tab depend on test results.

### 6. Dashboards (Phases 15, 17)

- Testing dashboard, Eclipse dashboard.
- Extend Proof tab with quality gate status.

**Rationale:** Observability and non-technical usability.

### 7. Cool New Features (Phases 18–24)

- Security gate, time-travel, collaborative PRD, policy-as-code, Explain mode.
- After core wiring is stable.

### 8. Sandboxes and Integrations (Phases 23, 25–28)

- Container sandbox, Figma, file refs, webhooks, interactive terminal.
- Lower priority; can be deferred.

---

## Dependency Graph (Simplified)

```
Phase 1 (GAP) 
  → Phase 2 (pipeline-engine)
  → Phase 11 (two units)
  → Phase 12 (templates)

Phase 1 
  → Phase 3 (anti-hallucination)
  → Phase 4 (attachments)
  → Phase 5 (MCP)
  → Phase 6 (ticket hierarchy)
  → Phase 7 (evidence schema)
  → Phase 8 (attach evidence)
  → Phase 9 (Proof tab)
  → Phase 10 (escalation)
  → Phase 13 (Vitest)
  → Phase 14 (Playwright)
  → Phase 15 (Testing dashboard)
  → Phase 16 (quality gates)
  → Phase 17 (Eclipse dashboard)
  → Phases 18–30
```

---

## Repo Safety Checklist (Before Every Change)

- [ ] On a branch (not main)
- [ ] Read-only analysis done for affected area
- [ ] No force push, no history rewrite
- [ ] No large folder renames without migration plan
- [ ] Ticket claimed and status posted

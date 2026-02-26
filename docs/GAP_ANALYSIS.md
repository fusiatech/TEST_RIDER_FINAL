# GAP Analysis: Current State vs Final Plan

**Phase 1 Deliverable**  
**Date:** 2025-02-26  
**Baseline:** `fc03c4027a6b3c2f319e2d7ef16e3210a7ec97a5`

---

## Executive Summary

The repository is a **SwarmUI** — a parallel CLI agent orchestrator with a Next.js web UI. It has substantial foundations: orchestration (chat/swarm/project modes), ticketing, job queue, scheduler, IDE tab, agent dashboard, and confidence-based anti-hallucination. However, several modules exist but are **not wired** (pipeline-engine, anti-hallucination), and many plan requirements are **absent** (Evidence Ledger, tool security gate, time-travel debugging, collaborative PRD, policy-as-code, sandboxes, Explain mode, two distinct orchestration units, full testing toolchain).

---

## 1. Product Shape: Idea → PRD → Architecture → Tickets → Implementation → Tests → Deploy

| Capability | Current State | Gap |
|------------|---------------|-----|
| Idea capture | IdeationBot component, ideationAutoRun/schedule in settings | No PRD generator; no architecture step |
| PRD | PRDSection in project dashboard (draft/approved/rejected) | PRD is manual; no collaborative editing |
| Architecture | None | No Mermaid diagrams, no architecture workspace |
| Tickets | Epic/task/subtask schema; TicketManager; Kanban | No subatomic tasks; no critical path; no approval workflows for feature breakdown |
| Implementation | Orchestrator runs agents; GitHub PR on ticket completion | Works |
| Tests | Security checks (tsc, eslint, npm audit); no test runner | No Vitest/Playwright; no coverage; no quality gates |
| Deploy | None | No deployable artefacts, no CI/CD |

---

## 2. Core Pillars

### 2.1 Integrated Cloud IDE

| Feature | Current | Gap |
|---------|---------|-----|
| Editor | Monaco, syntax highlighting, light/dark | Works |
| Terminal | Output panel only (agent output) | **No interactive shell** |
| File tree | FileBrowser, /api/files | Works |
| Extensions | None | **No extension management** |
| Git | GitHub integration (branch, commit, PR) | No in-IDE git UI |
| Settings | Settings panel | Works |

### 2.2 Ticket-First Workflow for Non-Technical Users

| Feature | Current | Gap |
|---------|---------|-----|
| Epics → tasks → subtasks | Schema supports epicId, storyId; TicketManager does not use | **Hierarchy not enforced** |
| Subatomic tasks | Not in schema | **Missing** |
| Dependencies | dependencies: string[] | Works |
| Critical path | None | **Missing** |
| Agent assignment | assignedRole, assignedProvider | Works |
| SLAs, retries, escalations | maxRetries in settings; no SLA | **No SLA; no escalation ticket** |
| Approval workflows | PRD approve/reject; ticket approve/reject in Review | **No approval for feature breakdown** |

### 2.3 Two Orchestration Units

| Unit | Current | Gap |
|------|---------|-----|
| **Deterministic workflow** | Scheduler (every-hour, daily, etc.) + JobQueue | Not clearly separated; no CI/deploy/report pipelines |
| **Agentic orchestration** | Orchestrator (chat/swarm/project) | Single orchestrator; pipeline-engine exists but **not imported** |
| Integration with tickets | Project mode uses TicketManager | Works |
| Integration with Evidence Ledger | No Evidence Ledger | **N/A** |

**Gap:** The plan requires **two distinct** orchestration units. Currently there is one orchestrator plus a scheduler. The `pipeline-engine.ts` provides a deterministic `runPipeline` but is unused.

### 2.4 Testing and Observability Dashboards

| Dashboard | Current | Gap |
|-----------|---------|-----|
| Agent dashboard | Pipeline progress, agent cards, confidence, logs | Works |
| Project dashboard | Kanban, PRD, stats, pipeline bar | Works |
| Testing dashboard | None | **Missing** — no history, logs, failures, coverage, trends |
| Eclipse dashboard | None | **Missing** — no workspace health, quotas, PRD generators, audit views |

### 2.5 Anti-Hallucination Guardrails

| Guardrail | Current | Gap |
|-----------|---------|-----|
| Strict schemas for agent IO | Zod schemas for messages, tickets, settings | Partial; no schema for agent tool calls |
| Tool-backed verification | Security checks (tsc, eslint, npm audit) | No verification of repo state, file existence |
| Refusal when evidence missing | None | **No refusal logic** |
| Escalation after 3 failures | None | **No automatic escalation ticket** |

---

## 3. "Cool New" Open-Source Features

### 3.1 Evidence Ledger

| Requirement | Current | Gap |
|-------------|---------|-----|
| Git branch, commit hash, diff summary | Ticket has `diff`; not structured | **No structured evidence** |
| CLI stdout/stderr excerpts | Agent output in memory; not persisted | **No persistent ledger** |
| Test run identifiers and report links | None | **Missing** |
| Ticket references | Tickets exist | Not linked as "what authorised the change" |
| File paths and line ranges | extractSources() extracts URLs/paths | Not attached to actions |
| Proof tab per ticket | None | **Missing** |
| Re-run buttons | None | **Missing** |

### 3.2 Tool and Extension Security Gate

| Requirement | Current | Gap |
|-------------|---------|-----|
| Version pinning, allowlisting | None | **Missing** |
| Automated scanning and provenance | None | **Missing** |
| Permissions shown to user | None | **Missing** |
| MCP servers | Config only; not started | **Stub** |

### 3.3 Time-Travel Debugging

| Requirement | Current | Gap |
|-------------|---------|-----|
| Session replay for web UI | None | **Missing** |
| Agent trace replay | None | **Missing** |
| One-click reproduction bundles | None | **Missing** |

### 3.4 Collaborative PRD and Architecture Workspace

| Requirement | Current | Gap |
|-------------|---------|-----|
| Real-time collaboration | None | **Missing** |
| Mermaid diagrams embedded | None | **Missing** |
| Versioned and linked to tickets | None | **Missing** |

### 3.5 Policy-as-Code Governance

| Requirement | Current | Gap |
|-------------|---------|-----|
| Enforce tools, modification paths | File write confirmation, max files per commit | **No policy engine** |
| Require tests for sensitive paths | None | **Missing** |
| Redaction for secrets exposure | None | **Missing** |

### 3.6 Hardened Execution Sandboxes

| Requirement | Current | Gap |
|-------------|---------|-----|
| Container sandboxing | None | **Missing** |
| MicroVM isolation | None | **Missing** |
| User-selectable "Safe Run" | None | **Missing** |

### 3.7 Non-Technical "Explain" Mode

| Requirement | Current | Gap |
|-------------|---------|-----|
| Plain-English explanation per ticket/PR | None | **Missing** |
| Links to Evidence Ledger | No ledger | **Missing** |

---

## 4. Integrations and Platform

| Integration | Current | Gap |
|------------|---------|-----|
| Queuing, scheduling, background execution | JobQueue, Scheduler | Works |
| Images and attachments | UI + schema; not sent to backend | **Not wired** |
| File referencing | Internal CLI temp file only | **No @file/path user feature** |
| Git hosting, PR checks, webhooks | GitHub via `gh` CLI | No webhooks, no PR checks |
| Figma | None | **Missing** |
| Custom MCP registry | Config only | **Not implemented** |
| Extension management | None | **Missing** |

---

## 5. Testing Infrastructure

| Component | Current | Gap |
|-----------|---------|-----|
| Vitest | Not present | **Missing** |
| Playwright | Not present | **Missing** |
| E2E scripts | test-orchestrator.ts, test-scheduler.ts | Manual; no npm test |
| Testing dashboard | None | **Missing** |
| Coverage, trends | None | **Missing** |
| Quality gates | Security + confidence | testingConfig not wired to security checks |

---

## 6. Unused / Orphaned Code

| Module | Status | Action |
|--------|--------|--------|
| `server/pipeline-engine.ts` | Not imported | Wire or deprecate |
| `server/anti-hallucination.ts` | Not imported | Wire (analyzeStageOutputs, selectBestOutput, etc.) |
| Attachments in ChatMessage | Not sent to backend | Wire to start-swarm / pipeline |
| MCP config | Stored, not used | Implement MCP passthrough |

---

## 7. Integration-First Strategy

1. **Wire existing modules first:** pipeline-engine, anti-hallucination, attachments, MCP.
2. **Extend ticket hierarchy:** epic → task → subtask → subatomic; enforce in TicketManager.
3. **Add Evidence Ledger:** schema + storage + Proof tab; attach to every agent action.
4. **Introduce second orchestration unit:** formalise deterministic (scheduler + pipeline-engine) vs agentic (orchestrator).
5. **Add Testing dashboard:** Vitest + Playwright + coverage; wire to quality gates.
6. **Add Eclipse dashboard:** workspace health, quotas, PRD generators, audit.
7. **Implement "cool new" features** in phases after core wiring.

---

## 8. Risk Summary

| Risk | Mitigation |
|------|------------|
| Overwriting repo | Branch-only work; PR-based; no force push |
| Parallel agent collisions | Ticket claiming; isolated branches; status updates |
| Orphaned code drift | Wire pipeline-engine and anti-hallucination in Phase 2 |
| Scope creep | 30-phase plan; no freestyling outside tickets |

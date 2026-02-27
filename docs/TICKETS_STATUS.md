# Ticket Status (Agent Coordination)

**Branch:** `cursor/phase6-T6.1-subatomic`  
**Last Updated:** 2025-02-26  
**Source of Truth:** See `docs/30_PHASE_PLAN.md` for full ticket definitions.

## Claiming Rules

- Post "Claiming T{X}.{Y}" before starting
- Work on isolated branch: `cursor/phase{N}-T{N}.{M}-{short-desc}`
- Post "T{X}.{Y} done, branch X, commit Y" on completion
- Rebase on main branch before PR

## Phase 2: Wire Pipeline-Engine

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T2.1 | Import pipeline-engine in orchestrator | In Progress | Agent 1 | cursor/phase2-T2.1-pipeline-engine |
| T2.2 | Stage config alignment | Done | Agent 1 | cursor/phase2-T2.1-pipeline-engine |
| T2.3 | Cancellation unification | Done | Agent 1 | cursor/phase2-T2.1-pipeline-engine |

## Phase 3: Wire Anti-Hallucination

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T3.1 | Use analyzeStageOutputs | Done | Agent 1 | cursor/phase2-T2.1-pipeline-engine |
| T3.2 | Use selectBestOutput | Done | Agent 1 | cursor/phase2-T2.1-pipeline-engine |
| T3.3 | Use shouldRerunValidation | Done | Agent 1 | cursor/phase2-T2.1-pipeline-engine |
| T3.4 | Refusal stub | Done | Agent 1 | cursor/phase2-T2.1-pipeline-engine |

## Phase 4: Wire Attachments

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T4.1 | Extend EnqueueSchema | In Progress | Agent 2 | cursor/phase4-T4.1-attachments |
| T4.2 | Pass attachments to orchestrator | Open | - | - |
| T4.3 | Store attachments in session | Open | - | - |

## Phase 5: MCP Passthrough

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T5.1 | MCP server spawn | Open | - | - |
| T5.2 | MCP env to orchestrator | Open | - | - |
| T5.3 | MCP allowlist schema | Open | - | - |

## Phase 6: Ticket Hierarchy

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T6.1 | SubatomicTask schema | Done | Agent 3 | cursor/phase6-T6.1-subatomic |
| T6.2 | TicketManager hierarchy | Done | Agent 3 | cursor/phase6-T6.1-subatomic |
| T6.3 | getNextTicketForAgent | Done | Agent 3 | cursor/phase6-T6.1-subatomic |
| T6.4 | Kanban swimlanes by epic | Open | - | - |

## Phase 9: Proof Tab and Re-Run

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T9.1 | Proof tab UI | Done | Agent 3 | cursor/phase6-T6.1-subatomic |
| T9.2 | Re-run button | Done (placeholder) | Agent 3 | cursor/phase6-T6.1-subatomic |
| T9.3 | Artefact display | Done | Agent 3 | cursor/phase6-T6.1-subatomic |

## Phase 15: Testing Dashboard

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T15.1 | Testing dashboard route | Done | Agent 3 | cursor/phase6-T6.1-subatomic |
| T15.2 | Test history | Done (placeholder) | Agent 3 | cursor/phase6-T6.1-subatomic |
| T15.3 | Failures list | Done (placeholder) | Agent 3 | cursor/phase6-T6.1-subatomic |

## Phase 17: Eclipse Dashboard

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T17.1 | Eclipse dashboard route | Done | Agent 3 | cursor/phase6-T6.1-subatomic |
| T17.2 | Workspace health | Done | Agent 3 | cursor/phase6-T6.1-subatomic |
| T17.4 | Tooling and guardrail settings | Done | Agent 3 | cursor/phase6-T6.1-subatomic |

## Phase 7: Evidence Ledger Schema and Storage

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T7.1 | EvidenceLedgerEntry schema | Done | Agent 4 | cursor/phase7-T7.1-evidence-schema |
| T7.2 | Evidence store | Done | Agent 4 | cursor/phase7-T7.1-evidence-schema |
| T7.3 | Link evidence to ticket | Done | Agent 4 | cursor/phase7-T7.1-evidence-schema |

## Phase 8: Attach Evidence to Agent Actions

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T8.1 | Create evidence on pipeline start | Done | Agent 4 | cursor/phase7-T7.1-evidence-schema |
| T8.2 | Append CLI stdout/stderr | Done | Agent 4 | cursor/phase7-T7.1-evidence-schema |
| T8.3 | Link ticket to evidence | Done | Agent 4 | cursor/phase7-T7.1-evidence-schema |
| T8.4 | Diff summary | Done | Agent 4 | cursor/phase7-T7.1-evidence-schema |

## Phase 10: Escalation

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T10.1 | retryCount on ticket | Done | - | cursor/cloud-development-environment-f66e |
| T10.2 | Auto-create escalation ticket | Done | - | cursor/cloud-development-environment-f66e |
| T10.3 | Escalation ticket content | Done | - | cursor/cloud-development-environment-f66e |

## Phase 16: Quality Gates

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T16.1 | Wire testingConfig to security checks | Done | Agent 4 | cursor/phase7-T7.1-evidence-schema |

## Phase 18: Tool and Extension Security Gate

| Ticket | Title | Status | Agent | Branch |
|--------|-------|--------|-------|--------|
| T18.1 | Extension allowlist schema | Done | Agent 4 | cursor/phase7-T7.1-evidence-schema |

## Agent Assignment (4 Sub-Agents)

| Agent | Phases | Focus |
|-------|--------|-------|
| **Agent 1 (Core)** | 2, 3, 13, 14 | Orchestration wiring, anti-hallucination, testing toolchain |
| **Agent 2 (Orchestration)** | 4, 5, 11, 12 | Attachments, MCP, two units, deterministic templates |
| **Agent 3 (UI)** | 6, 9, 15, 17, 21 | Ticket hierarchy, Proof tab, Testing dashboard, Eclipse dashboard, PRD |
| **Agent 4 (Quality)** | 7, 8, 10, 16, 18, 22 | Evidence Ledger, escalation, quality gates, security gate, policy |

---
Verified on commit `b4f840b28861`.

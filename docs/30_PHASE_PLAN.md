# 30-Phase Delivery Plan

**Phase 1 Deliverable**  
**Date:** 2025-02-26  
**Baseline:** `fc03c4027a6b3c2f319e2d7ef16e3210a7ec97a5`

---

## Plan Continuity Rule

- If current phase is not complete → continue with next required step.
- If current phase is complete → generate revised plan before additional work.
- No freestyling outside active plan and tickets.

---

## Phase Overview

| Phase | Focus | Key Deliverables |
|-------|-------|------------------|
| 1 | Repo analysis & GAP | Snapshot, GAP report, 30-phase plan |
| 2–5 | Wiring & foundations | pipeline-engine, anti-hallucination, attachments, MCP |
| 6–10 | Ticket hierarchy & Evidence Ledger | Epic→subatomic, Proof tab, ledger schema |
| 11–15 | Two orchestration units | Deterministic vs agentic separation |
| 16–20 | Testing & dashboards | Vitest, Playwright, Testing dashboard, Eclipse dashboard |
| 21–25 | Cool new features | Security gate, time-travel, collaborative PRD, policy-as-code |
| 26–30 | Sandboxes, Explain mode, integrations | Safe Run, Figma, Explain mode |

---

## Phase 1: Repo Analysis and GAP Discovery ✅

**Status:** Complete

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T1.1 | Reproducible snapshot | Commit hash, lockfile, line count documented | Manual verify docs exist | No code changes |
| T1.2 | GAP analysis | All plan pillars mapped to current state | Manual review | Read-only |
| T1.3 | 30-phase plan | Phases 2–30 defined with tickets | Manual review | Branch-only |

**Deliverables:** `docs/PHASE1_SNAPSHOT.md`, `docs/GAP_ANALYSIS.md`, `docs/30_PHASE_PLAN.md`

---

## Phase 2: Wire Pipeline-Engine (Deterministic Orchestration)

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T2.1 | Import pipeline-engine in orchestrator | Scheduler/background jobs use `runPipeline` from pipeline-engine | Unit test: runPipeline called for scheduled jobs | No changes to existing swarm flow |
| T2.2 | Stage config alignment | pipeline-engine StageConfig matches orchestrator roles | Assert stage names and roles match | Preserve backward compatibility |
| T2.3 | Cancellation unification | cancelAll() and cancelSwarm() coordinated | E2E: cancel stops both | Single cancellation source of truth |

**Dashboard:** None  
**Dependencies:** Phase 1

---

## Phase 3: Wire Anti-Hallucination Module

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T3.1 | Use analyzeStageOutputs | Orchestrator calls analyzeStageOutputs for each stage | Unit test: stage analysis used in swarm mode | Confidence still from confidence.ts |
| T3.2 | Use selectBestOutput | Best output selected for synthesis | Assert bestOutput used in final result | Fallback to first output if empty |
| T3.3 | Use shouldRerunValidation | Rerun logic from anti-hallucination | Unit test: rerun when confidence < threshold | No change to threshold semantics |
| T3.4 | Refusal stub | Return "refused" when confidence < 30 and no evidence | Unit test: refusal returned | Log refusal reason |

**Dashboard:** Agent dashboard shows refusal state  
**Dependencies:** Phase 1

---

## Phase 4: Wire Attachments to Pipeline

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T4.1 | Extend EnqueueSchema | Add optional attachments array | Schema validation test | Max 10 attachments, 5MB total |
| T4.2 | Pass attachments to orchestrator | Prompt builder includes attachment context | E2E: image in prompt affects output | Sanitise attachment content |
| T4.3 | Store attachments in session | Attachments persisted with message | GET session returns attachments | No PII in logs |

**Dashboard:** Chat shows attachment thumbnails  
**Dependencies:** Phase 1

---

## Phase 5: MCP Passthrough and Registry

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T5.1 | MCP server spawn | Start MCP servers from settings.mcpServers on pipeline start | Integration test: MCP process spawned | Timeout 10s for spawn |
| T5.2 | MCP env to orchestrator | mcpServers passed to CLI runner / agent context | Assert env vars passed | Sandbox: no network by default |
| T5.3 | MCP allowlist schema | Version, allowlist, sandbox in MCPServerSchema | Schema validation | Default sandbox: true |

**Dashboard:** Settings shows MCP status (running/stopped)  
**Dependencies:** Phase 1

---

## Phase 6: Ticket Hierarchy (Epic → Task → Subtask → Subatomic)

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T6.1 | SubatomicTask schema | Add level: 'subatomic' to TicketSchema | Schema validation | level required for new tickets |
| T6.2 | TicketManager hierarchy | createTicket enforces parentId, level, epicId | Unit test: invalid hierarchy rejected | Epic → Task → Subtask → Subatomic |
| T6.3 | getNextTicketForAgent | Respect level and dependencies | Unit test: subatomic only when subtask done | No orphan subtasks |
| T6.4 | Kanban swimlanes by epic | Project dashboard groups by epic | Visual test | Empty epic handling |

**Dashboard:** Project dashboard swimlanes  
**Dependencies:** Phase 1

---

## Phase 7: Evidence Ledger Schema and Storage

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T7.1 | EvidenceLedgerEntry schema | branch, commitHash, diffSummary, cliExcerpts, testRunId, ticketIds, filePaths | Zod schema | All fields optional except id, timestamp |
| T7.2 | Evidence store | lowdb table for evidence entries | CRUD test | Append-only |
| T7.3 | Link evidence to ticket | Ticket has evidenceIds: string[] | Schema migration | Backfill empty for existing |

**Dashboard:** None yet  
**Dependencies:** Phase 1

---

## Phase 8: Attach Evidence to Agent Actions

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T8.1 | Create evidence on pipeline start | branch, commitHash from git | Unit test: evidence created | Skip if not git repo |
| T8.2 | Append CLI stdout/stderr | On agent completion, add excerpt to evidence | Unit test: excerpt present | Max 2KB per agent |
| T8.3 | Link ticket to evidence | When ticket completes, add evidenceId | Assert ticket.evidenceIds updated | One evidence per run |
| T8.4 | Diff summary | Git diff --stat on completion | Unit test: diffSummary non-empty when changes | Max 1KB |

**Dashboard:** Proof tab (Phase 9)  
**Dependencies:** Phase 7

---

## Phase 9: Proof Tab and Re-Run

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T9.1 | Proof tab UI | Per-ticket tab showing evidence entries | Visual test | Read-only |
| T9.2 | Re-run button | Re-run pipeline with same prompt/ticket | E2E: re-run produces new evidence | Idempotent |
| T9.3 | Artefact display | Show branch, commit, diff, CLI excerpts | Manual verify | Truncate long content |

**Dashboard:** Project dashboard ticket detail  
**Dependencies:** Phase 8

---

## Phase 10: Escalation After 3 Failures

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T10.1 | retryCount on ticket | Increment on failure; max 3 | Unit test: retryCount capped | Escalate when retryCount >= 3 |
| T10.2 | Auto-create escalation ticket | On 3rd failure, create ticket with type=escalation | E2E: escalation ticket exists | Link to original ticket |
| T10.3 | Escalation ticket content | Logs, repro steps, evidence IDs | Assert content populated | No secrets in logs |

**Dashboard:** Project dashboard shows escalation badge  
**Dependencies:** Phase 6, 8

---

## Phase 11: Formalise Two Orchestration Units

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T11.1 | DeterministicWorkflowOrchestrator | Wraps pipeline-engine + scheduler; CI, deploy, report pipelines | Unit test: scheduled job uses deterministic path | No agent spawning in deterministic |
| T11.2 | AgenticOrchestrator | Rename/clarify current orchestrator; multi-agent, tool use | No logic change | Both integrate with tickets |
| T11.3 | Orchestrator registry | Settings choose orchestrator per job type | Config test | Default: agentic for chat/swarm |

**Dashboard:** Settings shows orchestrator type  
**Dependencies:** Phase 2

---

## Phase 12: Deterministic Pipeline Templates

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T12.1 | CI pipeline template | Stages: lint, typecheck, test, build | Run template, assert stages | No agent calls |
| T12.2 | Deploy pipeline template | Placeholder stages | Schema only | Not executable yet |
| T12.3 | Report pipeline template | Aggregate evidence, generate summary | Unit test | Read-only |

**Dashboard:** Scheduler panel shows template options  
**Dependencies:** Phase 11

---

## Phase 13: Testing Toolchain (Vitest)

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T13.1 | Vitest config | vitest.config.ts, coverage | npm run test passes | Coverage threshold 50% |
| T13.2 | Unit tests for orchestrator | runSwarmPipeline, mode detection | 5+ tests | Mock CLI spawn |
| T13.3 | Unit tests for TicketManager | createTicket, getNextTicketForAgent | 5+ tests | Isolated storage |
| T13.4 | npm run test script | package.json | CI-ready | Fail on no tests |

**Dashboard:** None yet  
**Dependencies:** Phase 1

---

## Phase 14: Testing Toolchain (Playwright E2E)

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T14.1 | Playwright config | e2e/ folder, baseURL | playwright test runs | Headless default |
| T14.2 | E2E: Chat flow | Send message, see response | E2E test | Mock swarm |
| T14.3 | E2E: Project create | Create project, see Kanban | E2E test | Isolated db |
| T14.4 | npm run test:e2e script | package.json | CI-ready | Retry 2 |

**Dashboard:** None yet  
**Dependencies:** Phase 13

---

## Phase 15: Testing Dashboard

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T15.1 | Testing dashboard route | /dashboard/testing or tab | Renders without error | |
| T15.2 | Test history | Last N runs, expandable logs | Manual verify | Persist to storage |
| T15.3 | Failures list | Failed tests with links | Unit test: failed extracted | |
| T15.4 | Coverage trends | Chart of coverage over time | Placeholder chart | |
| T15.5 | Re-run button | Re-run test suite | E2E: re-run works | |

**Dashboard:** New Testing dashboard  
**Dependencies:** Phase 13, 14

---

## Phase 16: Quality Gates Block Completion

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T16.1 | Wire testingConfig to security checks | Use settings.testingConfig (typescript, eslint, etc.) | Unit test: config controls checks | Default: all enabled |
| T16.2 | Block ticket completion | If quality gate fails, show error | E2E: cannot complete when failing | Override with approval (future) |
| T16.3 | Quality gate status in Proof tab | Show pass/fail per gate | Visual test | |

**Dashboard:** Proof tab, ticket detail  
**Dependencies:** Phase 9, 15

---

## Phase 17: Eclipse Dashboard (Workspace Health)

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T17.1 | Eclipse dashboard route | /dashboard/eclipse or tab | Renders | |
| T17.2 | Workspace health | Disk, memory, CLI status | API /api/eclipse/health | Read-only |
| T17.3 | Quotas display | Resource quotas if any | Placeholder | |
| T17.4 | Tooling and guardrail settings | Links to settings | Navigation test | |
| T17.5 | Audit view | List evidence entries | Reuse Proof tab logic | |

**Dashboard:** New Eclipse dashboard  
**Dependencies:** Phase 8

---

## Phase 18: Tool and Extension Security Gate

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T18.1 | Extension allowlist schema | id, version, permissions | Zod schema | |
| T18.2 | Scan before enable | Check version, provenance | Unit test: invalid rejected | Block if not allowlisted |
| T18.3 | Permissions UI | Show required permissions before enable | Visual test | User must confirm |
| T18.4 | MCP allowlist | Extend MCPServerSchema | Schema test | |

**Dashboard:** Settings extension section  
**Dependencies:** Phase 5

---

## Phase 19: Time-Travel Debugging (Session Replay)

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T19.1 | Session event log | Store UI events (click, input) with timestamp | Schema | Max 10k events per session |
| T19.2 | Replay API | POST /api/sessions/[id]/replay | Unit test | Read-only |
| T19.3 | Replay UI | Play/pause session replay | E2E: replay renders | No mutations during replay |

**Dashboard:** Session detail  
**Dependencies:** Phase 1

---

## Phase 20: Agent Trace Replay

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T20.1 | Agent trace schema | tools, prompts, outputs, costs, timing | Zod schema | |
| T20.2 | Store trace per run | Append to evidence or separate store | Unit test | |
| T20.3 | Trace replay UI | View tools, prompts, outputs timeline | Visual test | |
| T20.4 | One-click reproduction bundle | Export trace + evidence as JSON | Download test | Redact secrets |

**Dashboard:** Proof tab, agent dashboard  
**Dependencies:** Phase 8, 19

---

## Phase 21: Collaborative PRD Workspace

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T21.1 | PRD editor component | Rich text, Mermaid block | Visual test | |
| T21.2 | Real-time collaboration | WebSocket or CRDT for PRD | E2E: two users see updates | Conflict resolution |
| T21.3 | Mermaid embedding | Render Mermaid in PRD | Unit test: valid Mermaid | Sanitise |
| T21.4 | Link to tickets | PRD sections link to ticket IDs | Manual verify | |

**Dashboard:** Project dashboard PRD section  
**Dependencies:** Phase 1

---

## Phase 22: Policy-as-Code Governance

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T22.1 | Policy schema | tools, paths, gates, requireTests | Zod schema | |
| T22.2 | Policy engine | Evaluate policy before run | Unit test: policy blocks | Default: allow all |
| T22.3 | Require tests for paths | If path in policy.requireTests, block without test | Unit test | |
| T22.4 | Secrets redaction | Scan output for secrets; redact in logs | Unit test: redaction works | |

**Dashboard:** Settings policy section  
**Dependencies:** Phase 16

---

## Phase 23: Hardened Execution Sandboxes

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T23.1 | Safe Run mode setting | Container / MicroVM / None | Schema | Default: None |
| T23.2 | Container sandbox | Run CLI in Docker container | Integration test | Isolated network |
| T23.3 | MicroVM placeholder | Document future MicroVM | Docs only | Not implemented |
| T23.4 | User-selectable in UI | Dropdown in settings | Visual test | |

**Dashboard:** Settings  
**Dependencies:** Phase 5

---

## Phase 24: Non-Technical Explain Mode

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T24.1 | Explain schema | plainEnglish, evidenceIds | Zod schema | |
| T24.2 | Generate explain for ticket | LLM or template: "This ticket did X because Y" | Unit test: explain non-empty | Fallback to template |
| T24.3 | Explain tab per ticket | Show plain-English + evidence links | Visual test | |
| T24.4 | Explain for PR | On PR create, generate explain | Integration test | |

**Dashboard:** Proof tab, ticket detail  
**Dependencies:** Phase 9

---

## Phase 25: Figma Integration

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T25.1 | Figma API client | Fetch file, nodes | Unit test with mock | Token in env |
| T25.2 | Figma settings | API token, file URL | Settings schema | |
| T25.3 | Figma assets in ticket | Attach Figma frame to ticket | Manual verify | |
| T25.4 | GET /api/figma/file | API route | Integration test | |

**Dashboard:** Ticket detail, project dashboard  
**Dependencies:** Phase 1

---

## Phase 26: File Reference (@file/path)

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T26.1 | Detect @file in prompt | Regex or parser | Unit test | |
| T26.2 | Fetch file via /api/files | Resolve path, append to prompt | E2E: @file content in prompt | Path traversal guard |
| T26.3 | UI hint | Show "Referencing files: ..." | Visual test | |

**Dashboard:** Chat input  
**Dependencies:** Phase 1

---

## Phase 27: Git Webhooks and PR Checks

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T27.1 | Webhook endpoint | POST /api/webhooks/github | Verify signature | |
| T27.2 | PR check integration | On PR open, run quality gates | Integration test | |
| T27.3 | Status API | Report status to GitHub | Manual verify | |

**Dashboard:** Project dashboard  
**Dependencies:** Phase 16

---

## Phase 28: Interactive Terminal

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T28.1 | PTY in browser | xterm.js or similar | E2E: type command, see output | Sandbox |
| T28.2 | Terminal API | WebSocket or HTTP for PTY | Integration test | |
| T28.3 | IDE tab terminal | Replace output panel with interactive | Visual test | |

**Dashboard:** IDE tab  
**Dependencies:** Phase 1

---

## Phase 29: CI/CD Pipeline

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T29.1 | GitHub Actions workflow | Lint, typecheck, test, build | CI runs on PR | |
| T29.2 | Branch protection | Require checks for main | Docs | |
| T29.3 | Container image build | Dockerfile for app | Build test | |

**Dashboard:** None  
**Dependencies:** Phase 13, 14

---

## Phase 30: Documentation and Handoff

| Ticket | Title | AC | Test | Guardrail |
|--------|-------|----|------|-----------|
| T30.1 | Architecture doc | Update README with two orchestration units | Manual review | |
| T30.2 | Operator guide | How to run, configure, troubleshoot | Manual review | |
| T30.3 | Ticket system guide | For non-technical users | Manual review | |
| T30.4 | Evidence Ledger guide | How Proof tab works | Manual review | |

**Dashboard:** N/A  
**Dependencies:** All prior phases

---

## Agent Assignment Strategy (4 Sub-Agents)

| Agent | Phases | Focus |
|-------|--------|-------|
| **Agent 1 (Core)** | 2, 3, 13, 14 | Orchestration wiring, anti-hallucination, testing toolchain |
| **Agent 2 (Orchestration)** | 4, 5, 11, 12 | Attachments, MCP, two units, deterministic templates |
| **Agent 3 (UI)** | 6, 9, 15, 17, 21 | Ticket hierarchy, Proof tab, Testing dashboard, Eclipse dashboard, PRD |
| **Agent 4 (Quality)** | 7, 8, 10, 16, 18, 22 | Evidence Ledger, escalation, quality gates, security gate, policy |

**Phases 19–30:** Assign in round-robin or by dependency; coordinate via tickets.

---

## Parallel Agent Coordination

- **Ticket claiming:** Agent posts "Claiming T2.1" before starting.
- **Branch naming:** `cursor/phase{N}-{ticket-id}-{short-desc}` (e.g. `cursor/phase2-T2.1-pipeline-engine`).
- **Status updates:** Post on completion: "T2.1 done, branch X, commit Y."
- **Rebase:** Rebase on main (or integration branch) before PR; resolve conflicts preserving others' work.
- **Ticketing system:** Source of truth for ownership, priority, dependencies.

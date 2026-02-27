# SwarmUI - Comprehensive Gap Analysis V5
## February 27, 2026 - Deep Analysis with 400+ Issues Identified

---

# EXECUTIVE SUMMARY

After exhaustive analysis by 4 parallel agents, we have identified **405 issues** across the codebase:

| Category | Issues | Critical | High | Medium | Low |
|----------|--------|----------|------|--------|-----|
| Backend | 73 | 1 | 15 | 35 | 22 |
| Frontend | 100 | 0 | 8 | 42 | 50 |
| Testing | 160 | 20 | 75 | 55 | 10 |
| Integrations | 72 | 1 | 12 | 38 | 21 |
| **TOTAL** | **405** | **22** | **110** | **170** | **103** |

---

# PART 1: BACKEND GAPS (73 Issues)

## Critical Issues

| ID | Issue | Severity | File | Fix |
|----|-------|----------|------|-----|
| BE-013 | No input sanitization on prompt before CLI execution - SHELL INJECTION RISK | Critical | cli-runner.ts | Sanitize prompts for shell injection |

## High Severity Issues

| ID | Issue | Severity | File | Fix |
|----|-------|----------|------|-----|
| BE-001 | 48+ empty catch blocks swallow errors silently | High | Multiple server/*.ts | Add logging to catch blocks |
| BE-006 | No CSRF protection on API routes | High | app/api/**/*.ts | Add CSRF token validation |
| BE-007 | Rate limiting only on /api/jobs, not other sensitive endpoints | High | Multiple routes | Add rate limiting |
| BE-012 | WebSocket messages not authenticated per-message | High | ws-server.ts | Add session validation |
| BE-014 | File path traversal not validated in all file operations | High | server/evidence.ts | Validate paths within workspace |
| BE-046 | No circuit breaker for failing CLI providers | High | server/orchestrator.ts | Add circuit breaker pattern |
| BE-053 | Only 14 test files for 53 server files (~26% coverage) | High | tests/server/ | Add tests for untested modules |
| BE-065 | No tests for WebSocket server | High | - | Add WS server tests |
| BE-069 | lowdb is single-file JSON, not suitable for production | High | server/storage.ts | Add PostgreSQL/SQLite option |

## Medium Severity Issues

| ID | Issue | Severity | File | Fix |
|----|-------|----------|------|-----|
| BE-002 | `catch {}` blocks provide no context for debugging | Medium | orchestrator.ts | Log error context |
| BE-003 | Worktree cleanup failures silently ignored | Medium | orchestrator.ts | Log cleanup failures |
| BE-004 | MCP tool call parsing errors silently skipped | Medium | mcp-client.ts | Log malformed tool calls |
| BE-009 | No rate limiting on /api/sessions | Medium | app/api/sessions/route.ts | Add rate limiting |
| BE-010 | No rate limiting on /api/projects | Medium | app/api/projects/route.ts | Add rate limiting |
| BE-015 | No request body size limits on most API routes | Medium | app/api/**/*.ts | Add body size limits |
| BE-016 | Session creation accepts any ID without validation | Medium | app/api/sessions/route.ts | Validate session ID format |
| BE-018 | Scheduler cron expression validation is minimal | Medium | server/scheduler.ts | Add proper cron validation |
| BE-019 | No max length validation on prompt field | Medium | lib/types.ts | Add max length to schema |
| BE-021 | No pagination on GET /api/sessions | Medium | app/api/sessions/route.ts | Add limit/offset |
| BE-022 | No pagination on GET /api/projects | Medium | app/api/projects/route.ts | Add limit/offset |
| BE-023 | No pagination on GET /api/jobs | Medium | app/api/jobs/route.ts | Add limit/offset |
| BE-026 | No DELETE endpoint for sessions | Medium | app/api/sessions/route.ts | Add DELETE handler |
| BE-028 | No job retry endpoint | Medium | app/api/jobs/[id]/route.ts | Add POST for retry |
| BE-031 | Scheduler doesn't support actual cron syntax | Medium | server/scheduler.ts | Implement real cron parsing |
| BE-032 | No scheduler task history/logs | Medium | server/scheduler.ts | Track execution history |
| BE-033 | No scheduler task retry on failure | Medium | server/scheduler.ts | Add retry logic |
| BE-034 | No dead letter queue for failed jobs | Medium | server/job-queue.ts | Implement DLQ |
| BE-039 | Evidence ledger has no search/filter API | Medium | server/evidence.ts | Add search endpoint |
| BE-040 | Evidence ledger has no cleanup/retention policy | Medium | server/evidence.ts | Add auto-cleanup |
| BE-042 | Anti-hallucination doesn't track false positive rate | Medium | server/anti-hallucination.ts | Add metrics tracking |
| BE-044 | Confidence scoring doesn't weight by agent reliability | Medium | server/confidence.ts | Track agent accuracy |
| BE-045 | No agent performance metrics persistence | Medium | server/orchestrator.ts | Store performance history |
| BE-047 | No graceful degradation when all CLIs fail | Medium | server/orchestrator.ts | Add fallback behavior |
| BE-048 | No health check for individual CLI providers | Medium | server/cli-detect.ts | Add per-provider health |
| BE-050 | Output cache doesn't persist across restarts | Medium | server/output-cache.ts | Add persistent cache |
| BE-054 | No tests for storage.ts | Medium | - | Add storage tests |
| BE-055 | No tests for evidence.ts | Medium | - | Add evidence tests |
| BE-066 | 18 console.log calls instead of structured logger | Medium | Multiple files | Use createLogger |
| BE-067 | No request ID/correlation ID tracking | Medium | app/api/**/*.ts | Add correlation ID |
| BE-068 | No audit logging for all admin operations | Medium | app/api/admin/**/*.ts | Add audit logging |
| BE-070 | No database connection pooling | Medium | server/storage.ts | Add connection management |
| BE-071 | No database backup automation | Medium | - | Add automated backups |
| BE-072 | No database migration system | Medium | server/storage.ts | Add migration framework |

---

# PART 2: FRONTEND GAPS (100 Issues)

## High Severity Issues

| ID | Issue | Severity | File | Fix |
|----|-------|----------|------|-----|
| FE-018 | File tree items not keyboard navigable with arrows | High | file-tree.tsx | Add arrow key navigation |
| FE-026 | No error boundary around code editor | High | dev-environment.tsx | Wrap in ErrorBoundary |
| FE-035 | Sidebar width not responsive on mobile | High | dev-environment.tsx | Add mobile breakpoint |
| FE-036 | Terminal height not responsive on mobile | High | dev-environment.tsx | Adjust for small screens |
| FE-039 | Debugger panel unusable on mobile | High | debugger-panel.tsx | Create mobile layout |
| FE-041 | Split editor not usable on mobile | High | dev-environment.tsx | Disable split on mobile |
| FE-044 | No autosave functionality for editor | High | dev-environment.tsx | Add debounced autosave |
| FE-060 | No session recovery after page refresh | High | dev-environment.tsx | Persist to localStorage |

## Medium Severity Issues (Selected)

| ID | Issue | Severity | File | Fix |
|----|-------|----------|------|-----|
| FE-001 | Missing `aria-label` on sidebar toggle buttons | Medium | dev-environment.tsx | Add aria-label |
| FE-004 | File tabs lack `role="tablist"` and `role="tab"` | Medium | dev-environment.tsx | Add ARIA tab roles |
| FE-010 | Git panel branch dropdown lacks `aria-expanded` | Medium | git-panel.tsx | Add aria-expanded |
| FE-015 | No keyboard shortcut to focus file browser | Medium | dev-environment.tsx | Add Ctrl+Shift+E |
| FE-016 | No keyboard shortcut to focus terminal | Medium | dev-environment.tsx | Add Ctrl+` |
| FE-020 | Git file list not navigable with arrow keys | Medium | git-panel.tsx | Add keyboard nav |
| FE-021 | No loading indicator when fetching file content | Medium | file-browser.tsx | Add loading state |
| FE-025 | Code editor LSP connection has no retry UI | Medium | code-editor.tsx | Add retry button |
| FE-027 | No error handling for failed file save | Medium | dev-environment.tsx | Show error message |
| FE-028 | Git operations lack detailed error messages | Medium | git-panel.tsx | Show specific errors |
| FE-029 | Terminal connection errors not displayed | Medium | terminal-emulator.tsx | Show error UI |
| FE-37 | File tabs overflow not touch-friendly | Medium | dev-environment.tsx | Add swipe gestures |
| FE-38 | Git panel too cramped on mobile | Medium | git-panel.tsx | Add mobile layout |
| FE-42 | Project dashboard Kanban not scrollable on touch | Medium | project-dashboard.tsx | Add touch scroll |
| FE-43 | Testing dashboard charts too small on mobile | Medium | testing-dashboard.tsx | Adjust chart sizes |
| FE-45 | No undo/redo for file changes outside Monaco | Medium | dev-environment.tsx | Add undo stack |
| FE-46 | No confirmation when closing multiple unsaved files | Medium | dev-environment.tsx | Add batch confirm |
| FE-54 | Terminal has no command history | Medium | terminal-emulator.tsx | Add history |
| FE-56 | Debugger lacks watch expressions | Medium | debugger-panel.tsx | Add watch panel |
| FE-57 | Debugger lacks conditional breakpoint UI | Medium | debugger-panel.tsx | Add condition input |
| FE-58 | No offline support indicator | Medium | chat-view.tsx | Show offline banner |
| FE-65 | Dialog close doesn't return focus | Medium | dev-environment.tsx | Add focus restoration |
| FE-69 | No file rename functionality | Medium | file-browser.tsx | Add rename option |
| FE-70 | No file delete functionality | Medium | file-browser.tsx | Add delete option |
| FE-71 | No new file creation in file browser | Medium | file-browser.tsx | Add create file |
| FE-72 | No new folder creation in file browser | Medium | file-browser.tsx | Add create folder |
| FE-83 | No find and replace across files | Medium | dev-environment.tsx | Add global replace |
| FE-84 | No symbol outline/structure view | Medium | dev-environment.tsx | Add outline panel |
| FE-85 | No problems/diagnostics panel | Medium | dev-environment.tsx | Add problems panel |
| FE-86 | No integrated diff viewer | Medium | git-panel.tsx | Add side-by-side diff |
| FE-87 | No merge conflict 3-way editor | Medium | git-panel.tsx | Add merge editor |
| FE-90 | No test debugging integration | Medium | testing-dashboard.tsx | Add debug test |
| FE-91 | No code coverage highlighting in editor | Medium | code-editor.tsx | Add coverage decorations |
| FE-96 | Muted text may fail WCAG AA | Medium | Multiple files | Increase contrast |
| FE-99 | Small icon buttons below 44px touch target | Medium | Multiple files | Increase touch targets |

---

# PART 3: TESTING GAPS (160 Issues)

## Critical Issues

| ID | Issue | Severity | File | Fix |
|----|-------|----------|------|-----|
| T001 | No unit tests for `server/storage.ts` (867 lines) | Critical | server/storage.ts | Create storage.test.ts |
| T002 | No unit tests for `server/ws-server.ts` | Critical | server/ws-server.ts | Create ws-server.test.ts |
| T005 | No unit tests for `server/pipeline-engine.ts` | Critical | server/pipeline-engine.ts | Create tests |
| T025 | No unit tests for `lib/store.ts` (1830 lines) | Critical | lib/store.ts | Create store.test.ts |
| T027 | No unit tests for `lib/encryption.ts` | Critical | lib/encryption.ts | Create encryption.test.ts |
| T034 | No unit tests for `lib/auth-utils.ts` | Critical | lib/auth-utils.ts | Create auth-utils.test.ts |
| T054 | Only 6 component tests for 99 components | Critical | tests/components/ | Add 93 more tests |
| T055 | No tests for `chat-view.tsx` | Critical | components/chat-view.tsx | Create tests |
| T056 | No tests for `dev-environment.tsx` (1354 lines) | Critical | components/dev-environment.tsx | Create tests |
| T073 | No tests for 71 API routes | Critical | app/api/ | Create API route tests |
| T074 | No tests for auth routes | Critical | app/api/auth/ | Create auth.test.ts |
| T075 | No tests for admin routes | Critical | app/api/admin/ | Create admin.test.ts |
| T087 | No WebSocket integration tests | Critical | tests/integration/ | Create ws tests |
| T109 | No CSRF protection tests | Critical | tests/security/ | Add CSRF tests |
| T110 | No XSS prevention tests | Critical | tests/security/ | Add XSS tests |
| T111 | No authentication bypass tests | Critical | tests/security/ | Add auth tests |
| T112 | No authorization tests | Critical | tests/security/ | Add authz tests |
| T131 | No tests for concurrent job execution | Critical | tests/ | Add race tests |

## High Severity Issues (Selected)

| ID | Issue | Severity | File | Fix |
|----|-------|----------|------|-----|
| T003 | No unit tests for terminal-manager.ts | High | server/terminal-manager.ts | Create tests |
| T004 | No unit tests for github-integration.ts | High | server/github-integration.ts | Create tests |
| T006 | No unit tests for api-runner.ts | High | server/api-runner.ts | Create tests |
| T008 | No unit tests for prompt-builder.ts | High | server/prompt-builder.ts | Create tests |
| T011 | No unit tests for ticket-manager.ts | High | server/ticket-manager.ts | Create tests |
| T012 | No unit tests for test-runner.ts | High | server/test-runner.ts | Create tests |
| T019 | No unit tests for secrets-scanner.ts | High | server/secrets-scanner.ts | Create tests |
| T022 | No unit tests for code-validator.ts | High | server/code-validator.ts | Create tests |
| T026 | No unit tests for lib/types.ts validation | High | lib/types.ts | Create tests |
| T028 | No unit tests for lib/ws-client.ts | High | lib/ws-client.ts | Create tests |
| T030 | No unit tests for lib/sanitize.ts | High | lib/sanitize.ts | Create tests |
| T031 | No unit tests for lib/rate-limit.ts | High | lib/rate-limit.ts | Create tests |
| T033 | No unit tests for lib/permissions.ts | High | lib/permissions.ts | Create tests |
| T035 | No unit tests for lib/audit.ts | High | lib/audit.ts | Create tests |
| T057-T072 | No tests for major components | High | Multiple | Create component tests |
| T076-T085 | No tests for API routes | High | app/api/ | Create route tests |
| T088 | No database integration tests | High | tests/integration/ | Create db tests |
| T091-T100 | Missing E2E test scenarios | High | e2e/ | Create E2E tests |
| T103 | No performance tests for WebSocket | High | tests/performance/ | Enhance tests |
| T106 | No memory leak tests | High | tests/performance/ | Create tests |
| T108 | No concurrent user simulation | High | tests/performance/ | Create tests |
| T113-T118 | Missing security tests | High | tests/security/ | Create tests |
| T119-T120 | Missing contract tests | High | tests/contract/ | Create tests |
| T122-T128 | Missing edge case tests | High | tests/ | Create tests |
| T132-T134 | Missing race condition tests | High | tests/ | Create tests |
| T135-T145 | CI/CD gaps | High | .github/workflows/ | Fix workflows |
| T151-T156 | Test infrastructure gaps | High | tests/ | Improve infrastructure |

---

# PART 4: INTEGRATION GAPS (72 Issues)

## Critical Issues

| ID | Issue | Severity | File | Fix |
|----|-------|----------|------|-----|
| EXT-002 | No extension signature verification | Critical | extension-manager.ts | Add code signing |

## High Severity Issues

| ID | Issue | Severity | File | Fix |
|----|-------|----------|------|-----|
| GH-001 | No rate limiting for GitHub API calls | High | github-integration.ts | Add rate limiting |
| GH-013 | No pagination for list operations | High | github-integration.ts | Add pagination |
| GH-015 | No retry logic for transient failures | High | github-integration.ts | Add retry |
| MCP-001 | Missing `prompts/list` method | High | mcp-client.ts | Implement prompts |
| MCP-002 | Missing `prompts/get` method | High | mcp-client.ts | Implement prompts |
| MCP-007 | No connection health check/ping | High | mcp-client.ts | Add ping/pong |
| MCP-008 | Missing auto-reconnect on disconnect | High | mcp-client.ts | Add reconnection |
| MCP-015 | Global messageBuffer causes issues | High | mcp-client.ts | Move to class |
| FIG-008 | No rate limiting for Figma API | High | figma-client.ts | Add rate limiting |
| LSP-001 | Only TypeScript/JavaScript supported | High | lsp-server.ts | Add more languages |
| LSP-007 | Global messageBuffer in LSP | High | lsp-server.ts | Move per-connection |
| EXT-012 | No CSP enforcement for extensions | High | extension-manager.ts | Add CSP |
| EXT-013 | Missing network capability enforcement | High | extension-manager.ts | Add sandboxing |
| TYP-001 | No runtime validation on API routes | High | lib/types.ts | Add middleware |
| TYP-002 | Missing WebSocket message validation | High | lib/types.ts | Validate WS messages |

## Medium Severity Issues (Selected)

| ID | Issue | Severity | File | Fix |
|----|-------|----------|------|-----|
| GH-002 | Missing GitHub Webhooks support | Medium | github-integration.ts | Add webhooks |
| GH-003 | No GitHub Releases API | Medium | github-integration.ts | Add releases |
| GH-005 | No GitHub Projects v2 API | Medium | github-integration.ts | Add projects |
| GH-010 | Missing branch protection API | Medium | github-integration.ts | Add protection |
| GH-011 | No GitHub Actions secrets API | Medium | github-integration.ts | Add secrets |
| MCP-003 | No resources/subscribe support | Medium | mcp-client.ts | Add subscription |
| MCP-004 | Missing completion/complete method | Medium | mcp-client.ts | Add completion |
| MCP-009 | No server capability negotiation | Medium | mcp-client.ts | Use capabilities |
| MCP-011 | No progress reporting | Medium | mcp-client.ts | Add progress |
| MCP-012 | Missing cancellation support | Medium | mcp-client.ts | Add cancel |
| MCP-016 | No tool input validation | Medium | mcp-client.ts | Validate args |
| FIG-001 | Missing Figma Comments API | Medium | figma-client.ts | Add comments |
| FIG-002 | No Figma Components API | Medium | figma-client.ts | Add components |
| FIG-006 | No Figma Variables API | Medium | figma-client.ts | Add variables |
| FIG-010 | No Figma Webhooks | Medium | figma-client.ts | Add webhooks |
| FIG-013 | Missing OAuth flow | Medium | figma-client.ts | Add OAuth |
| EXT-001 | Registry installation not implemented | Medium | extension-manager.ts | Implement registry |
| EXT-003 | Missing extension update mechanism | Medium | extension-manager.ts | Add update |
| EXT-004 | No extension dependency resolution | Medium | extension-manager.ts | Resolve deps |
| EXT-010 | No TextMate grammar support | Medium | lib/extensions.ts | Add grammars |
| LSP-002 | No language server auto-download | Medium | lsp-server.ts | Auto-install |
| LSP-004 | No formatting support | Medium | lsp-server.ts | Add formatting |
| LSP-005 | Missing rename support | Medium | lsp-server.ts | Add rename |
| DAP-001 | Chrome debugging not implemented | Medium | debug-adapter.ts | Implement Chrome |
| DAP-002 | Python debugpy incomplete | Medium | debug-adapter.ts | Complete DAP |
| DAP-003 | No exception breakpoints | Medium | debug-adapter.ts | Add exceptions |
| TYP-003 | No schema versioning/migration | Medium | lib/types.ts | Add versioning |
| TYP-004 | Missing OpenAPI spec generation | Medium | lib/types.ts | Generate OpenAPI |

---

# PART 5: PRIORITIZED IMPLEMENTATION PLAN

## Phase 1: Critical Security & Stability (P0)

### Sprint 1.1: Security Fixes
| Task | Issue IDs | Acceptance Criteria |
|------|-----------|---------------------|
| Add input sanitization to CLI runner | BE-013 | Shell injection tests pass |
| Add CSRF protection | BE-006 | CSRF tokens validated |
| Add WebSocket authentication | BE-012 | WS messages require session |
| Add extension signature verification | EXT-002 | Unsigned extensions blocked |
| Add rate limiting to all sensitive routes | BE-007-011 | Rate limits enforced |

### Sprint 1.2: Critical Test Coverage
| Task | Issue IDs | Acceptance Criteria |
|------|-----------|---------------------|
| Add storage.ts tests | T001 | 80% coverage |
| Add ws-server.ts tests | T002 | 80% coverage |
| Add encryption.ts tests | T027 | 100% coverage |
| Add auth-utils.ts tests | T034 | 100% coverage |
| Add CSRF/XSS security tests | T109-T112 | All security tests pass |

**Definition of Done Phase 1:**
- All critical security issues fixed
- Security tests passing
- No critical vulnerabilities in scan

## Phase 2: High Priority Gaps (P1)

### Sprint 2.1: Error Handling & Logging
| Task | Issue IDs | Acceptance Criteria |
|------|-----------|---------------------|
| Fix empty catch blocks | BE-001-005 | All errors logged |
| Add correlation ID tracking | BE-067 | Request IDs in logs |
| Add structured logging everywhere | BE-066 | No console.log |
| Add error boundaries | FE-026 | Components don't crash |

### Sprint 2.2: Test Coverage Expansion
| Task | Issue IDs | Acceptance Criteria |
|------|-----------|---------------------|
| Add component tests (20 critical) | T055-T072 | 20 component tests |
| Add API route tests | T073-T085 | All routes tested |
| Add integration tests | T086-T090 | 5 integration tests |
| Add E2E tests | T091-T101 | 10 E2E scenarios |

### Sprint 2.3: Frontend Accessibility
| Task | Issue IDs | Acceptance Criteria |
|------|-----------|---------------------|
| Add ARIA labels | FE-001-014 | axe-core passes |
| Add keyboard navigation | FE-015-020 | All navigable |
| Add mobile responsiveness | FE-035-043 | Mobile usable |

### Sprint 2.4: Integration Improvements
| Task | Issue IDs | Acceptance Criteria |
|------|-----------|---------------------|
| Add GitHub rate limiting/retry | GH-001,015 | Retries work |
| Add MCP reconnection | MCP-007,008 | Auto-reconnects |
| Fix global buffer issues | MCP-015, LSP-007 | No cross-connection |
| Add more LSP languages | LSP-001 | Python, Go supported |

**Definition of Done Phase 2:**
- 60% test coverage
- All high severity issues fixed
- Accessibility audit passes

## Phase 3: Medium Priority Gaps (P2)

### Sprint 3.1: API Improvements
| Task | Issue IDs | Acceptance Criteria |
|------|-----------|---------------------|
| Add pagination to all list endpoints | BE-021-023 | Pagination works |
| Add session DELETE endpoint | BE-026 | Sessions deletable |
| Add job retry endpoint | BE-028 | Jobs retryable |
| Add proper cron parsing | BE-031 | Cron syntax works |

### Sprint 3.2: Frontend Features
| Task | Issue IDs | Acceptance Criteria |
|------|-----------|---------------------|
| Add autosave | FE-044 | Files auto-saved |
| Add session recovery | FE-060 | State persists |
| Add file operations | FE-069-074 | CRUD works |
| Add find/replace across files | FE-083 | Global replace works |

### Sprint 3.3: Integration Features
| Task | Issue IDs | Acceptance Criteria |
|------|-----------|---------------------|
| Add GitHub webhooks | GH-002 | Webhooks received |
| Add MCP prompts support | MCP-001,002 | Prompts work |
| Add Figma comments | FIG-001 | Comments work |
| Add extension updates | EXT-003 | Updates work |

### Sprint 3.4: Test Infrastructure
| Task | Issue IDs | Acceptance Criteria |
|------|-----------|---------------------|
| Add test fixtures | T151 | Fixtures exist |
| Add data factories | T152 | Factories work |
| Add mock servers | T153 | Mocks work |
| Add mutation testing | T157 | Stryker runs |

**Definition of Done Phase 3:**
- 80% test coverage
- All medium severity issues fixed
- Performance benchmarks met

## Phase 4: Low Priority Enhancements (P3)

### Sprint 4.1: Nice-to-Have Features
| Task | Issue IDs | Acceptance Criteria |
|------|-----------|---------------------|
| Add GitHub gists | GH-004 | Gists work |
| Add Figma version history | FIG-005 | History viewable |
| Add debugger logpoints | DAP-004 | Logpoints work |
| Add minimap | FE-080 | Minimap shows |

**Definition of Done Phase 4:**
- All issues addressed
- Full documentation
- Production deployment ready

---

# VALIDATION EVIDENCE REQUIRED

## Per Phase

| Phase | Tests Required | Evidence |
|-------|---------------|----------|
| P0 | Security tests, penetration test | Security scan report |
| P1 | Unit tests (60%), E2E tests | Coverage report |
| P2 | Integration tests, performance tests | Benchmark report |
| P3 | Full regression suite | Test report |

---

# SUMMARY

**Total Issues Found: 405**
- Critical: 22
- High: 110
- Medium: 170
- Low: 103

**Estimated Effort:**
- Phase 1 (P0): 2 sprints
- Phase 2 (P1): 4 sprints
- Phase 3 (P2): 4 sprints
- Phase 4 (P3): 2 sprints

**Total: 12 sprints (~6 months)**

The system has a solid foundation but requires significant work on:
1. Security hardening
2. Test coverage (currently ~26% server, ~6% components)
3. Error handling
4. Mobile responsiveness
5. Integration completeness

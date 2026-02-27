# AGENTS.md

## Cursor Cloud specific instructions

- **Tech stack:** Next.js 15 (App Router, Turbopack), React 19, TypeScript 5, Tailwind CSS v4, Zustand 5, shiki v1, react-markdown 9, Radix UI, sonner, zod.
- **Package manager:** npm (lockfile: `package-lock.json`).

### Services

| Service | Command | Notes |
|---------|---------|-------|
| Full dev server (Next.js + WS) | `npm run dev` | Custom server via `tsx server.ts` on port 3000, includes WebSocket |
| Next.js only (UI work) | `npm run dev:next` | Turbopack on port 3000, no WS server |

### Key commands

- **Lint:** `npm run lint`
- **Typecheck:** `npm run typecheck`
- **Build:** `npm run build`
- **Dev server:** `npm run dev` (port 3000)

### Caveats

- Tailwind v4 uses `@theme` blocks in `app/globals.css` instead of `tailwind.config.js`. Custom colors are defined there.
- `node-pty` is listed as a dependency (for server-side CLI agent spawning) and is in `serverExternalPackages` in `next.config.ts`. If `npm install` fails on `node-pty`, ensure build tools are available (`python3`, `make`, `g++`).
- The `.next` directory may contain stale build artifacts. If the dev server returns 500 or build fails with ENOENT for manifest files, delete `.next` and restart.
- **Turbopack caveat in Cloud VM:** `npm run dev:next` uses `--turbopack` which can cause persistent 500 errors in fuse-overlayfs environments. For UI-only dev work in Cloud VMs, prefer `npx next dev -p 3000` (without turbopack). The first few requests may 500; keep retrying — it stabilises within 20-30s.
- **Recommended Cloud VM dev command:** `NEXT_DIST_DIR=/tmp/.next-swarm npx next dev -p 3000` — moves the `.next` build output to tmpfs, completely avoiding fuse-overlayfs ENOENT errors. This is the most reliable way to run the dev server in Cloud VMs.
- `npm run build` compiles and type-checks successfully but may intermittently fail at static generation with ENOENT errors (filesystem race in fuse-overlayfs). Retry with `rm -rf .next && npm run build` — typically succeeds within 1–3 attempts. If the build consistently fails at static generation, use `npm run typecheck` and `npm run lint` as reliable validation. The dev server (`npx next dev -p 3000`) works reliably for verifying the app.
- **Theme system:** Light/dark mode via `next-themes` (ThemeProvider in `app/layout.tsx`). Light mode colors are in `:root` / `@theme` in `globals.css`; dark mode overrides in `.dark` selector. The `attribute="class"` strategy is used.
- **App modes:** Three modes (chat/swarm/project) stored as `mode` in Zustand. The sidebar mode selector and welcome screen prompts change per mode.
- If `tsc --noEmit` reports stale errors, delete `tsconfig.tsbuildinfo` (incremental build cache).
- `npm run dev` now runs a custom server (`server.ts` via tsx) that starts both Next.js and the WebSocket server on the same port (3000). Use `npm run dev:next` for UI-only work without the WS server.
- The `lib/cli-registry.ts` must NOT have `'use client'` — it is imported by both server and client code. Node.js-specific CLI detection lives in `server/cli-detect.ts`.
- API routes: `/api/sessions`, `/api/sessions/[id]`, `/api/settings`, `/api/cli-detect`, `/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/tickets`, `/api/health`, `/api/jobs`, `/api/jobs/[id]`, `/api/scheduler`, `/api/scheduler/[id]` — all use lowdb for persistence via `server/storage.ts`.
- **Job Queue:** `server/job-queue.ts` — persistent background job processing. When `start-swarm` is received via WS, jobs are enqueued rather than run directly. Progress is broadcast to all WS clients. Jobs survive browser disconnects.
- **Prompt escaping:** `server/cli-runner.ts` writes prompts to `<os.tmpdir()>/swarm-ui/swarm-prompt-*.txt` temp files instead of passing inline to bash. This avoids shell-escaping issues with backticks, dollar signs, and newlines in LLM prompts. Temp files are cleaned up on process exit/kill.
- **CLI availability:** `server/orchestrator.ts` calls `detectInstalledCLIs()` at pipeline start and filters `enabledCLIs` to only installed CLIs. If none are available, a mock agent at `<os.tmpdir()>/swarm-ui/mock-agent.sh` is used as fallback.
- **Cross-platform temp paths:** `lib/paths.ts` provides `getTempDir()` and `getTempFile()` utilities that use `os.tmpdir()` for Windows compatibility. All server-side temp file operations should use these utilities.
- **Confidence scoring:** `server/confidence.ts` filters out outputs shorter than 20 chars before computing Jaccard similarity. Empty/crashed agent outputs return confidence 0 (not 95).
- **Scheduler:** `server/scheduler.ts` — supports `every-hour`, `every-6-hours`, `daily`, `weekly` schedules using `setTimeout`. Persisted to lowdb.
- **GitHub Integration:** `server/github-integration.ts` — wraps `gh` CLI for branch/commit/PR operations. Requires `gh auth login` before use.
- UI libraries: `recharts` (charts), `framer-motion` (animations), `lucide-react` (icons), `@monaco-editor/react` (code editor) are all installed and used across dashboard components.
- **IDE panel:** The app has three tabs: Chat, Dashboard, IDE. The IDE tab (`components/dev-environment.tsx`) combines a file browser, Monaco code editor, terminal output, and an optional preview iframe. Files are served via `/api/files` (listing) and `/api/files/[...path]` (content read/write).
- **MCP config:** MCP server configuration is in the Settings dialog (`components/mcp-config.tsx`). Servers are stored as `mcpServers` in the Settings schema.
- **File upload:** Chat input supports file/image attachments via `components/file-upload.tsx`. Attachments are stored as optional `attachments` on `ChatMessage`.
- **CLI retry logic:** `server/cli-runner.ts` supports `maxRetries` and `retryDelayMs` options. Exit codes 137/143 (timeout/signal kills) are not retried.
- **Output cache:** `server/output-cache.ts` — LRU in-memory cache (max 100 entries, 30 min TTL) keyed by prompt+provider SHA-256 hash. The orchestrator checks cache before spawning CLIs; cached results with confidence >70% are reused.
- **Structured logger:** `server/logger.ts` — creates component-scoped loggers that write color-coded console output AND JSON lines to `<os.tmpdir()>/swarm-ui/swarm-ui.log`. Used in `ws-server.ts` and `server.ts`.
- **Health endpoint:** `/api/health` reports uptime, active job count, queue depth, installed CLIs (cached 60s), last pipeline run time, memory usage, and cache stats.
- **Prometheus metrics:** `/api/metrics` exposes Prometheus-format metrics via `prom-client`. Metrics include: `http_requests_total`, `http_request_duration_seconds`, `swarm_active_jobs`, `swarm_queued_jobs`, `swarm_pipeline_runs_total`, `swarm_agent_response_seconds`, `swarm_confidence_score`, `swarm_cache_hits_total`, `swarm_cache_misses_total`, `swarm_websocket_connections`, `swarm_agent_spawns_total`, `swarm_agent_failures_total`. Use `docker-compose --profile monitoring up` to start Prometheus (port 9090) and Grafana (port 3001).
- **Graceful shutdown:** `server.ts` handles SIGINT/SIGTERM: cancels running swarms, closes WS connections, closes HTTP server, then exits. 10s timeout before forced exit.
- **Build in Cloud VM:** Use `NEXT_DIST_DIR=/tmp/.next-build npm run build` (absolute `/tmp` path) to avoid fuse-overlayfs issues. The workspace-relative `/tmp` won't work for builds.

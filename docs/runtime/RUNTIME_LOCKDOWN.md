# Runtime Lockdown

## Local Run Profile
- Host: `127.0.0.1`
- Port: `4100`
- Command: `npm run dev:local`
- Node: `v22.22.0` (via `fnm`)

## Critical Files (Do Not Change Without Re-Validation)
- `server.ts`
- `server/ws-server.ts`
- `lib/ws-client.ts`
- `scripts/dev-local.mjs`
- `.vscode/launch.json`
- `middleware.ts`
- `auth.ts`

## Required Re-Validation After Any Change
1. App reachable at `http://127.0.0.1:4100`.
2. Login/registration routes work.
3. WebSocket connects and stays stable.
4. Prompt submit gets `run.accepted` and result/error.
5. `/api/health` returns healthy/degraded without runtime exceptions.

## Known Pitfalls
- Service worker cache from previous runs can cause stale behavior.
- Running on `3000/3001` may collide with other local services.
- In production, missing auth secret must fail closed.

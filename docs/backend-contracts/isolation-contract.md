# Backend Isolation Contract

## Scope

This backend stream is isolated from UI wiring and chat/orchestration internals.

## Protected Files (No behavioral mutation)

- `server/orchestrator.ts`
- `server/job-queue.ts`
- `server/pipeline-engine.ts`
- `server/ws-server.ts`
- `app/api/jobs/*`
- `app/api/v1/runs/*`
- `components/*`
- `app/*` page components

## Allowed Backend Areas

- `server/integrations/*`
- `server/billing/*`
- `server/providers/*`
- `server/files/*`
- `app/api/integrations/*`
- `app/api/billing/*`
- `app/api/providers/*`
- `app/api/me/profile`
- `app/api/me/integrations`
- `lib/contracts/*`
- `tests/backend/*`
- `scripts/report-api-inventory.mjs`

## Security Guardrails

- All new endpoints require auth except signed webhooks and OAuth callback URLs.
- All secrets are encrypted at rest and redacted in responses.
- OAuth callbacks require valid one-time state.
- Webhooks require signature verification and replay-safe event handling.

## Compatibility

- Legacy global settings for Figma/MCP remain fallback sources while user-scoped integrations are rolling out.
- Existing settings schema fields remain readable for one migration window.

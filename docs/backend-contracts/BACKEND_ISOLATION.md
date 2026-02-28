# Backend Isolation Contract (Enforced)

## Objective

This workstream implements backend capabilities only. It must not wire UI/UX and must not modify core chat/AI orchestration logic.

## Do Not Modify (Behavioral Changes)

- `server/orchestrator.ts`
- `server/job-queue.ts`
- `server/pipeline-engine.ts`
- `server/ws-server.ts`
- `app/api/jobs/*`
- `app/api/v1/runs/*`
- `components/*`
- `app/*` pages and UI wiring code

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
- `tests/contract/*`
- `scripts/report-api-inventory.mjs`
- `scripts/sync-openapi-missing.mjs`
- `docs/backend-contracts/*`

## Security Baseline

- Signed webhook verification for Stripe/GitHub/Slack/Linear.
- Replay-safe webhook handling via event dedupe and retention window.
- CSRF enforcement on authenticated mutating backend routes.
- Rate limiting on all API routes, with stricter webhook and mutation policies.
- Encrypted at-rest integration credentials and redaction in API responses.

## Compatibility Window

- Legacy global settings remain readable for one migration window.
- User-scoped profile/integration records are the canonical source of truth.

# Rollout and Monitoring Runbook

## Feature Flag Order

1. `FEATURE_BACKEND_INTEGRATIONS=true`
2. `FEATURE_PROVIDER_CATALOG=true`
3. `FEATURE_FIGMA_USER_SCOPED=true`
4. `FEATURE_MCP_MANAGED_SERVERS=true`
5. `FEATURE_GITHUB_INTEGRATION=true`
6. `FEATURE_SLACK_INTEGRATION=true`
7. `FEATURE_LINEAR_INTEGRATION=true`
8. `FEATURE_BILLING_STRIPE=true`

## Preflight

- Configure OAuth and webhook secrets.
- Run `npm run report:api-inventory`.
- Run `npx vitest run tests/backend`.
- Verify public webhook routes in middleware config.

## Dogfood Checks

- Connect/disconnect each integration for one test user.
- Send signed webhook test events for Stripe/GitHub/Slack/Linear.
- Verify `api/health` includes provider catalog/model summary.
- Verify IDE file access with Windows-style paths (`%5C`) no longer returns 404.

## Rollback

- Disable relevant feature flags.
- Keep existing global settings fallback for Figma/MCP.
- Preserve integration records for later re-enable.

## Migration

- Run `npm run migrate:integrations` once to backfill user-scoped records from global Figma/MCP settings.

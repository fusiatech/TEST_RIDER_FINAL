# Security Hardening Notes

## Implemented Controls

- Auth-gated all user-facing integration APIs.
- Kept only webhook + OAuth callback endpoints public in middleware.
- Added one-time OAuth `state` storage with expiry and consume-once semantics.
- Encrypted third-party tokens/secrets at rest in db-backed integration records.
- Redacted secrets in API responses (`********`).
- Added strict webhook signature verification for:
  - Stripe (`Stripe-Signature`)
  - GitHub (`X-Hub-Signature-256`)
  - Slack (`X-Slack-Signature` + timestamp tolerance)
  - Linear (`Linear-Signature` / `X-Linear-Signature`)
- Added replay/idempotency protection for Stripe event processing.
- Added MCP command/tool policy controls and secure defaults.
- Added callback URL origin validation for OAuth connect endpoints.
- Added billing redirect URL allowlist enforcement.
- Added secure path normalization for IDE file operations (Windows + traversal-safe).

## Remaining Security Backlog (recommended next)

- Add per-route CSRF tokens for state-changing cookie-auth endpoints.
- Add explicit rate-limit middleware on all new integration routes.
- Add per-provider secret rotation jobs + stale-token alerts.
- Add webhook nonce store for non-Stripe providers.
- Add integration-specific RBAC scopes beyond authenticated-user baseline.
- Move secrets from lowdb to dedicated secret manager for production.

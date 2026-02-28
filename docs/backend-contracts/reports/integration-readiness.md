# Integration Readiness Matrix

Generated: 2026-02-28

| Integration | Connect | Status | Disconnect | Webhook | User-Scoped Secrets | Notes |
|---|---|---|---|---|---|---|
| GitHub | Yes | Yes | Yes | Yes | Yes | OAuth/App install + signature verification |
| Figma | Yes | Yes | Yes | N/A | Yes | Legacy global token fallback retained |
| MCP | Yes (managed servers) | Yes | Yes | N/A | Yes (server env scoped by user) | Policy controls + templates |
| Stripe Billing | Checkout/Portal | Subscription/Entitlements | Via portal | Yes | N/A | Idempotent webhook processing |
| Slack | Yes | Yes | Yes | Yes | Yes | OAuth + Slack signature verification |
| Linear | Yes | Yes | Yes | Yes | Yes | OAuth + issue link mapping support |

## Security Controls Enabled

- Auth required for non-public integration routes.
- OAuth one-time `state` with expiry.
- Encrypted secrets at rest.
- Redacted secret material in responses.
- Signature verification for Stripe/GitHub/Slack/Linear webhooks.
- Replay dedupe for GitHub/Slack/Linear webhook deliveries.
- 7-day webhook delivery retention window.
- Middleware-enforced CSRF on authenticated mutating backend-integration/billing/provider/profile routes.
- Middleware-enforced rate limits (auth mutations 60/min, webhook endpoints 300/min).
- Feature flags gate all new backend integration surfaces.

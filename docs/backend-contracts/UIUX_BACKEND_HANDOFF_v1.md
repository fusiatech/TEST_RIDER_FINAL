# UI/UX Backend Handoff (Contract-Only, No Wiring)

This document is for the UI/UX team to implement screens against backend APIs.  
No code wiring is included in this backend workstream.

## 1. Endpoint Catalog by Feature

### Profile and Integration Ownership
- `GET /api/me/profile`
- `PATCH /api/me/profile`
- `GET /api/me/integrations`

### Provider and Model Visibility
- `GET /api/providers/catalog`
- `GET /api/providers/models`
- `GET /api/models/catalog` (aggregated compatibility endpoint)

### Billing
- `POST /api/billing/checkout-session`
- `POST /api/billing/portal-session`
- `GET /api/billing/subscription`
- `GET /api/billing/entitlements`

### GitHub
- `POST /api/integrations/github/connect`
- `GET /api/integrations/github/status`
- `DELETE /api/integrations/github/disconnect`

### Figma
- `POST /api/integrations/figma/connect`
- `GET /api/integrations/figma/status`
- `DELETE /api/integrations/figma/disconnect`

### MCP
- `GET /api/integrations/mcp/servers`
- `POST /api/integrations/mcp/servers`
- `PATCH /api/integrations/mcp/servers`
- `DELETE /api/integrations/mcp/servers?id={serverId}`
- `GET /api/integrations/mcp/templates`

### Slack
- `POST /api/integrations/slack/connect`
- `GET /api/integrations/slack/status`
- `DELETE /api/integrations/slack/disconnect`

### Linear
- `POST /api/integrations/linear/connect`
- `GET /api/integrations/linear/status`
- `DELETE /api/integrations/linear/disconnect`
- `GET /api/integrations/linear/issue-links`
- `POST /api/integrations/linear/issue-links`

## 2. Standard Error/State Matrix

- `401 Unauthorized`: user session missing/expired.
- `403 CSRF_VALIDATION_FAILED`: missing/invalid CSRF token on mutating authenticated routes.
- `429 RATE_LIMIT_EXCEEDED`: per-user or per-IP rate limit hit.
- `503 FeatureDisabled`: endpoint is feature-flagged off in environment.
- `400`: payload invalid, callback state invalid, signature invalid, or provider-specific validation failed.

## 3. UX State Model per Integration

- `disconnected`: show connect CTA.
- `pending`: show waiting/auth-in-progress state.
- `connected`: show metadata, scopes, and disconnect CTA.
- `error`: show retriable state and provider error message.

## 4. Callback/Webhook State Timing

- OAuth callback completion is synchronous at callback API.
- Provider status should be polled for up to 30 seconds after callback return.
- Webhook-driven updates are eventually consistent; recommend 5s polling for max 1 minute on billing/integration status screens.

## 5. Security-Visible UX Requirements

- Mutating authenticated calls must include CSRF token header and cookie pair.
- Handle `429` with retry countdown from API response `reset`.
- Never display raw token values returned by backend; backend returns redacted secrets.
- On connect flows, enforce same-origin callback URL construction in frontend.

## 6. UI Component Readiness Checklist

- Profile overview: ready (profile + integration summary APIs available).
- Billing status card: ready.
- Billing manage button (portal): ready.
- Provider catalog/model browser: ready.
- GitHub/Figma/Slack/Linear connection cards: ready.
- MCP managed servers table/editor: ready.
- Linear issue-link table: ready.

## 7. QA Checklist for UI Team

- Validate connect/disconnect lifecycle for each integration.
- Validate `401/403/429/503` states and user-facing copy.
- Validate billing checkout redirect and portal redirect flows.
- Validate retry behavior on transient webhook-consistency delays.
- Validate CSRF token acquisition/refresh flow before mutation actions.

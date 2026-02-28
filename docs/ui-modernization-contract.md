# Fusia AI UI Modernization Contract (v8)

## IA (Locked)
1. Top bar:
   - Brand logo + hamburger only on left.
   - Utility cluster on right: preview, notifications, theme, shortcuts, profile.
2. Left rail:
   - Primary nav order: `Dashboard`, `Conversations`, `IDE`, `Observability`.
   - No visible mode tabs or mode switcher controls.
   - `Start work` is the only creation entry:
     - `New conversation`
     - `New project`
     - `New multi-agent run`
     - `Run in current context`
3. Main canvas:
   - Conversation surface (chat UX)
   - Unified Control Center with tabs: `Overview`, `Delivery`, `Quality`, `Operations`
   - IDE and Observability surfaces.
4. Panels:
   - Shared slide panel primitive for Tasks/Schedule only.
   - Preview: desktop right panel, mobile bottom sheet.
   - No Ideas side panel in primary flow.

## Visual Guardrails
1. Minimal card usage and low icon noise.
2. No gray hover/open artifacts on controls.
3. Consistent hover/focus/active/disabled interaction states.
4. Theme parity across `fusia`, `graphite`, `atlas` in light/dark.

## Core Interaction Rules
1. No horizontal top tab strip.
2. Hidden mode state is retained for execution compatibility but never exposed as sidebar mode tabs.
3. `New conversation` always creates and activates a fresh session.
4. Personalization route is query-based only: `/settings?section=personalization`.
5. `Back to App` always routes to `/app`.
6. Preview must open a live target, not a close-only control state.

## Chat Contract
1. Composer controls:
   - Provider
   - Model
   - Conditional Reasoning (`Standard` / `Deep`) only when model supports it.
2. Removed from visible composer:
   - Auto/Intent dropdown
   - legacy context button near composer
3. Response rendering:
   - Structured, readable blocks (summary/actions/code/logs)
   - Follow-output toggle (off by default)
   - Guided mode de-emphasizes confidence and technical noise
   - Expert mode surfaces technical detail by default
4. Suggestion system:
   - Single follow-up suggestion rail only (no duplicate recommendation rails)
   - Suggestions are clickable and send to composer loop
5. Run activity:
   - Compact timeline component
   - No repeated large agent-card flood
6. Prompt steering queue:
   - Users can queue prompts while a run is active
   - Queued prompts auto-run in order after the active run completes

## Event Scoping
1. WS events are filtered by active `sessionId` + `runId`.
2. Unrelated run events do not render in active conversation.

## Settings + Language
1. Capability-first user-facing labels.
2. Avoid generic "CLI everywhere" wording in UI copy.
3. Keep internal compatibility keys unchanged.

## State-Screen Coverage
1. `LoadingState`
2. `ErrorState`
3. `EmptyState`
4. `NoDataState`
5. `OfflineState`
6. Route-level: `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx`
7. Interactive loading UX:
   - Chat uses an in-stream workflow loader during active runs.
   - Control Center/Quality/Observability use workflow loaders with progress stages.
   - Loading surfaces must keep the composer/action loop visible where applicable.

## Deterministic Actions
1. Top bar preview/profile/shortcuts actions use `data-action-id`.
2. Rail nav/actions + `Start work` options use `data-action-id`.
3. Composer send/stop/provider/model/reasoning actions use `data-action-id`.
4. Settings and API docs back actions use `data-action-id`.

## No-Regression Checklist
1. `Back to App` works from Settings and API docs.
2. `Start work` options create the correct context every time.
3. Preview open/close works on desktop and mobile breakpoints.
4. Personalization uses `/settings?section=personalization` consistently.

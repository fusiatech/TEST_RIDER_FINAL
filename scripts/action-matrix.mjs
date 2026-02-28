import { readFile } from 'node:fs/promises'

const checks = [
  { file: 'components/top-bar.tsx', pattern: 'data-action-id="topbar-hamburger"' },
  { file: 'components/top-bar.tsx', pattern: 'data-action-id="topbar-preview-toggle"' },
  { file: 'components/top-bar.tsx', pattern: 'data-action-id="topbar-profile-menu"' },
  { file: 'components/top-bar.tsx', pattern: 'data-action-id="topbar-personalization"' },
  { file: 'components/settings-workspace.tsx', pattern: 'data-action-id="settings-back-to-app"' },
  { file: 'app/api-docs/page.tsx', pattern: 'data-action-id="api-docs-back-to-app"' },
  { file: 'components/sidebar.tsx', pattern: 'data-testid="new-session-button"' },
  { file: 'components/chat-view.tsx', pattern: 'data-action-id="composer-provider-select"' },
  { file: 'components/chat-view.tsx', pattern: 'data-action-id="composer-model-select"' },
  { file: 'components/chat-view.tsx', pattern: 'data-action-id="composer-send"' },
]

let failed = false

for (const check of checks) {
  const content = await readFile(check.file, 'utf8')
  if (!content.includes(check.pattern)) {
    failed = true
    console.error(`MISSING ${check.pattern} in ${check.file}`)
  }
}

if (failed) {
  process.exit(1)
}

console.log('Action matrix audit passed')

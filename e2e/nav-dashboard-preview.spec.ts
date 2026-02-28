import { test, expect } from './fixtures'

test.describe('Navigation Dashboard Preview', () => {
  test('rail-first navigation and dashboard render', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/app')
    await authenticatedPage.waitForLoadState('networkidle')

    await expect(authenticatedPage.locator('[data-action-id="rail-nav-dashboard"]')).toBeVisible()
    await expect(authenticatedPage.locator('[data-action-id="rail-nav-chat"]')).toBeVisible()
    await expect(authenticatedPage.locator('[data-action-id="rail-nav-ide"]')).toBeVisible()
    await expect(authenticatedPage.locator('[data-action-id="rail-nav-observability"]')).toBeVisible()

    await authenticatedPage.locator('[data-action-id="rail-nav-dashboard"]').click()
    await expect(authenticatedPage.locator('text=Control Center')).toBeVisible()
  })

  test('preview toggle opens and closes preview surface', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/app')
    await authenticatedPage.waitForLoadState('networkidle')

    const previewToggle = authenticatedPage.locator('[data-action-id="topbar-preview-toggle"]')
    await expect(previewToggle).toBeVisible()
    await previewToggle.click()
    await expect(authenticatedPage.locator('[data-action-id="preview-url-input"]')).toBeVisible()

    await previewToggle.click()
    await expect(authenticatedPage.locator('[data-action-id="preview-url-input"]')).toHaveCount(0)
  })

  test('profile personalization routes deterministically', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/app')
    await authenticatedPage.waitForLoadState('networkidle')

    await authenticatedPage.locator('[data-action-id="topbar-profile-menu"]').click()
    await authenticatedPage.locator('[data-action-id="topbar-personalization"]').click()

    await expect(authenticatedPage).toHaveURL(/\/settings\?section=personalization/)
  })
})


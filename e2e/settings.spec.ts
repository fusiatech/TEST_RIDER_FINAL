import { test, expect, SettingsPage } from './fixtures'

test.describe('Settings', () => {
  test('settings page opens with content', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage)
    await settingsPage.open()

    await expect(authenticatedPage.getByRole('heading', { name: /settings/i }).first()).toBeVisible()
    await expect(authenticatedPage.locator('text=Profile Personalization')).toBeVisible()
  })

  test('personalization query routing is deterministic', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings?section=personalization')
    await authenticatedPage.waitForLoadState('networkidle')

    await expect(authenticatedPage).toHaveURL(/\/settings\?section=personalization/)
    await expect(authenticatedPage.locator('section#personalization')).toBeVisible()
  })

  test('back to app action works', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage)
    await settingsPage.open()

    await authenticatedPage.locator('[data-action-id="settings-back-to-app"]').click()
    await expect(authenticatedPage).toHaveURL(/\/app|\/$/)
  })

  test('personalization toggle can be changed', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage)
    await settingsPage.open()

    const toggle = authenticatedPage
      .locator('div:has-text("Show keyboard helper in top bar") [role="switch"]')
      .first()
    await expect(toggle).toBeVisible()

    const stateBefore = await toggle.getAttribute('aria-checked')
    await toggle.click()
    await authenticatedPage.waitForTimeout(500)
    const stateAfter = await toggle.getAttribute('aria-checked')
    expect(stateAfter).not.toBe(stateBefore)
  })
})


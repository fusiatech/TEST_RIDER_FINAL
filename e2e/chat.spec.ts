import { test, expect, ChatPage } from './fixtures'

test.describe('Chat Interface', () => {
  test('chat interface loads', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage)
    await chatPage.goto()

    await expect(authenticatedPage.locator('textarea#chat-input')).toBeVisible({ timeout: 10000 })
    await expect(authenticatedPage.locator('[data-action-id="start-work-menu-trigger"]')).toBeVisible()
  })

  test('sending a message shows user message', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage)
    await chatPage.goto()

    const testMessage = `E2E message ${Date.now()}`
    await chatPage.sendMessage(testMessage)

    await expect(authenticatedPage.locator('[data-testid="message"]').filter({ hasText: testMessage }).first()).toBeVisible({
      timeout: 10000,
    })
  })

  test('start work creates a new conversation', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage)
    await chatPage.goto()

    await chatPage.startWork('conversation')
    await expect(authenticatedPage.locator('[data-testid="chat-input"], textarea#chat-input').first()).toBeVisible()
  })

  test('composer can queue prompts', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage)
    await chatPage.goto()

    const input = authenticatedPage.locator('textarea#chat-input').first()
    await input.fill('Queue this prompt from e2e')
    await authenticatedPage.locator('[data-action-id="composer-queue"]').click()

    await expect(authenticatedPage.locator('text=Queued prompts')).toBeVisible({ timeout: 5000 })
    await expect(authenticatedPage.locator('[data-action-id="chat-queue-remove"]').first()).toBeVisible()
  })
})


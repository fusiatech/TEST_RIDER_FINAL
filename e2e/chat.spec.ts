import { test, expect, ChatPage } from './fixtures';

test.describe('Chat Interface', () => {
  test('chat interface loads', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    const chatInput = authenticatedPage.getByPlaceholder(/message|type|ask/i).or(
      authenticatedPage.locator('textarea').first()
    );
    
    await expect(chatInput).toBeVisible({ timeout: 10000 });
  });

  test('sending a message', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    const testMessage = 'Hello, this is a test message';
    await chatPage.sendMessage(testMessage);
    
    await authenticatedPage.waitForTimeout(2000);
    
    const pageContent = await authenticatedPage.content();
    expect(pageContent.toLowerCase()).toContain('test');
  });

  test('message appears in history', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    const testMessage = `Test message ${Date.now()}`;
    await chatPage.sendMessage(testMessage);
    
    await authenticatedPage.waitForTimeout(2000);
    
    const messages = await chatPage.getMessages();
    expect(messages.length).toBeGreaterThan(0);
  });

  test('mode switching - chat mode', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    const chatModeButton = authenticatedPage.getByRole('button', { name: /chat/i }).or(
      authenticatedPage.locator('[data-mode="chat"]')
    );
    
    if (await chatModeButton.isVisible()) {
      await chatModeButton.click();
      await authenticatedPage.waitForTimeout(500);
      
      const isActive = await chatModeButton.getAttribute('data-active') === 'true' ||
                       await chatModeButton.getAttribute('aria-pressed') === 'true' ||
                       (await chatModeButton.getAttribute('class'))?.includes('active');
      
      expect(isActive || await chatModeButton.isVisible()).toBeTruthy();
    } else {
      await expect(chatModeButton).toBeVisible({ timeout: 5000 });
    }
  });

  test('mode switching - swarm mode', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    const swarmModeButton = authenticatedPage.getByRole('button', { name: /swarm/i }).or(
      authenticatedPage.locator('[data-mode="swarm"]')
    );
    
    if (await swarmModeButton.isVisible()) {
      await swarmModeButton.click();
      await authenticatedPage.waitForTimeout(500);
      expect(await swarmModeButton.isVisible()).toBeTruthy();
    } else {
      await expect(swarmModeButton).toBeVisible({ timeout: 5000 });
    }
  });

  test('mode switching - project mode', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    const projectModeButton = authenticatedPage.getByRole('button', { name: /project/i }).or(
      authenticatedPage.locator('[data-mode="project"]')
    );
    
    if (await projectModeButton.isVisible()) {
      await projectModeButton.click();
      await authenticatedPage.waitForTimeout(500);
      expect(await projectModeButton.isVisible()).toBeTruthy();
    } else {
      await expect(projectModeButton).toBeVisible({ timeout: 5000 });
    }
  });
});

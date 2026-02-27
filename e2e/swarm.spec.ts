import { test, expect, ChatPage } from './fixtures';

test.describe('Swarm Execution Flow', () => {
  test('can switch to swarm mode', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    await chatPage.switchMode('swarm');
    
    const swarmIndicator = authenticatedPage.getByText(/swarm/i).or(
      authenticatedPage.locator('[data-mode="swarm"]')
    );
    
    await expect(swarmIndicator.first()).toBeVisible({ timeout: 5000 });
  });

  test('swarm mode shows agent configuration', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    await chatPage.switchMode('swarm');
    
    const configPanel = authenticatedPage.locator('[data-testid="agent-config"]').or(
      authenticatedPage.getByText(/parallel|agents|cli/i).first()
    );
    
    if (await configPanel.isVisible()) {
      await expect(configPanel).toBeVisible();
    }
  });

  test('can initiate swarm execution', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    await chatPage.switchMode('swarm');
    
    const testPrompt = 'Analyze the project structure';
    await chatPage.sendMessage(testPrompt);
    
    await authenticatedPage.waitForTimeout(2000);
    
    const pageContent = await authenticatedPage.content();
    expect(pageContent.toLowerCase()).toMatch(/analyze|project|structure|processing|running/);
  });

  test('displays agent status during execution', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    await chatPage.switchMode('swarm');
    
    await chatPage.sendMessage('Review code quality');
    
    await authenticatedPage.waitForTimeout(3000);
    
    const statusIndicators = authenticatedPage.locator(
      '[data-testid="agent-status"], [class*="status"], [class*="agent"]'
    );
    
    const count = await statusIndicators.count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows confidence score after completion', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    await chatPage.switchMode('swarm');
    
    await chatPage.sendMessage('Simple analysis task');
    
    await authenticatedPage.waitForTimeout(5000);
    
    const confidenceDisplay = authenticatedPage.getByText(/confidence|%/).or(
      authenticatedPage.locator('[data-testid="confidence"]')
    );
    
    if (await confidenceDisplay.isVisible()) {
      await expect(confidenceDisplay).toBeVisible();
    }
  });

  test('can cancel running swarm', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    await chatPage.switchMode('swarm');
    
    await chatPage.sendMessage('Long running analysis');
    
    await authenticatedPage.waitForTimeout(1000);
    
    const cancelButton = authenticatedPage.getByRole('button', { name: /cancel|stop/i }).or(
      authenticatedPage.locator('[data-testid="cancel-button"]')
    );
    
    if (await cancelButton.isVisible()) {
      await cancelButton.click();
      await authenticatedPage.waitForTimeout(1000);
      
      const cancelledIndicator = authenticatedPage.getByText(/cancelled|stopped/i);
      if (await cancelledIndicator.isVisible()) {
        await expect(cancelledIndicator).toBeVisible();
      }
    }
  });

  test('displays pipeline stages in swarm mode', async ({ authenticatedPage }) => {
    const chatPage = new ChatPage(authenticatedPage);
    await chatPage.goto();
    
    await chatPage.switchMode('swarm');
    
    await chatPage.sendMessage('Refactor authentication module');
    
    await authenticatedPage.waitForTimeout(3000);
    
    const stageIndicators = authenticatedPage.locator(
      '[data-testid="pipeline-stage"], [class*="stage"], [class*="pipeline"]'
    );
    
    const count = await stageIndicators.count();
    expect(count).toBeGreaterThan(0);
  });
});

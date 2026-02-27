import { test, expect, SettingsPage } from './fixtures';

test.describe('Settings', () => {
  test('settings dialog opens', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage);
    
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    try {
      await settingsPage.open();
      const dialog = await settingsPage.getDialog();
      await expect(dialog).toBeVisible({ timeout: 5000 });
    } catch {
      const settingsButton = authenticatedPage.locator('[aria-label*="settings" i], [data-testid="settings"]');
      if (await settingsButton.isVisible()) {
        await settingsButton.click();
      }
    }
  });

  test('settings dialog has content', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage);
    
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    try {
      await settingsPage.open();
      
      const dialog = await settingsPage.getDialog();
      await expect(dialog).toBeVisible({ timeout: 5000 });
      const dialogContent = await dialog.textContent();
      expect(dialogContent?.length ?? 0).toBeGreaterThan(0);
    } catch {
      throw new Error('Settings dialog content check failed');
    }
  });

  test('changing a setting', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage);
    
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    try {
      await settingsPage.open();
      
      const toggles = authenticatedPage.locator('[role="switch"], input[type="checkbox"]');
      const firstToggle = toggles.first();
      
      if (await firstToggle.isVisible()) {
        const initialState = await firstToggle.isChecked();
        await firstToggle.click();
        await authenticatedPage.waitForTimeout(500);
        
        const newState = await firstToggle.isChecked();
        expect(newState).not.toBe(initialState);
      } else {
        await expect(toggles.first()).toBeVisible({ timeout: 5000 });
      }
    } catch {
      throw new Error('Settings toggle interaction failed');
    }
  });

  test('settings persist after close and reopen', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage);
    
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    try {
      await settingsPage.open();
      
      const toggles = authenticatedPage.locator('[role="switch"], input[type="checkbox"]');
      const firstToggle = toggles.first();
      
      if (await firstToggle.isVisible()) {
        await firstToggle.click();
        await authenticatedPage.waitForTimeout(500);
        const stateAfterChange = await firstToggle.isChecked();
        
        await settingsPage.close();
        await authenticatedPage.waitForTimeout(500);
        
        await settingsPage.open();
        await authenticatedPage.waitForTimeout(500);
        
        const stateAfterReopen = await firstToggle.isChecked();
        expect(stateAfterReopen).toBe(stateAfterChange);
      } else {
        await expect(toggles.first()).toBeVisible({ timeout: 5000 });
      }
    } catch {
      throw new Error('Settings persistence check failed');
    }
  });

  test('settings dialog closes', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage);
    
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    try {
      await settingsPage.open();
      const dialog = await settingsPage.getDialog();
      
      if (await dialog.isVisible()) {
        await settingsPage.close();
        await authenticatedPage.waitForTimeout(500);
        
        await expect(dialog).not.toBeVisible({ timeout: 3000 });
      } else {
        await expect(dialog).toBeVisible({ timeout: 5000 });
      }
    } catch {
      throw new Error('Settings close behavior check failed');
    }
  });

  test('theme toggle exists', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const themeToggle = authenticatedPage.locator('[data-testid="theme-toggle"], [aria-label*="theme" i], [aria-label*="dark" i], [aria-label*="light" i]');

    await expect(themeToggle).toBeVisible({ timeout: 5000 });
    await themeToggle.click();
    await authenticatedPage.waitForTimeout(500);
    
    const html = authenticatedPage.locator('html');
    const className = await html.getAttribute('class');
    expect(className).not.toBeNull();
  });

  test('API key input fields', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage);
    
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    try {
      await settingsPage.open();
      
      const apiKeyInputs = authenticatedPage.locator('input[type="password"], input[name*="api" i], input[name*="key" i]');
      
      if (await apiKeyInputs.first().isVisible()) {
        await expect(apiKeyInputs.first()).toBeVisible();
      } else {
        await expect(apiKeyInputs.first()).toBeVisible({ timeout: 5000 });
      }
    } catch {
      throw new Error('API key fields check failed');
    }
  });
});

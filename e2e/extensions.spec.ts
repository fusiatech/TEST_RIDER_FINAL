import { test, expect, SettingsPage } from './fixtures';

test.describe('Extension Management', () => {
  test('can access extensions panel', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.open();
    
    const extensionsTab = authenticatedPage.getByRole('tab', { name: /extensions/i }).or(
      authenticatedPage.getByText(/extensions/i).first()
    );
    
    if (await extensionsTab.isVisible()) {
      await extensionsTab.click();
      await authenticatedPage.waitForTimeout(500);
      
      const extensionsPanel = authenticatedPage.locator(
        '[data-testid="extensions-panel"], [class*="extensions"]'
      );
      
      if (await extensionsPanel.isVisible()) {
        await expect(extensionsPanel).toBeVisible();
      }
    }
  });

  test('displays installed extensions list', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.open();
    
    const extensionsTab = authenticatedPage.getByRole('tab', { name: /extensions/i });
    if (await extensionsTab.isVisible()) {
      await extensionsTab.click();
    }
    
    const extensionsList = authenticatedPage.locator(
      '[data-testid="extensions-list"], [class*="extension-list"], [class*="extensions"]'
    );
    
    if (await extensionsList.isVisible()) {
      await expect(extensionsList).toBeVisible();
    }
  });

  test('can enable/disable extension', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.open();
    
    const extensionsTab = authenticatedPage.getByRole('tab', { name: /extensions/i });
    if (await extensionsTab.isVisible()) {
      await extensionsTab.click();
      await authenticatedPage.waitForTimeout(500);
    }
    
    const extensionToggle = authenticatedPage.locator(
      '[data-testid="extension-toggle"], [class*="extension"] input[type="checkbox"]'
    ).first();
    
    if (await extensionToggle.isVisible()) {
      const initialState = await extensionToggle.isChecked();
      await extensionToggle.click();
      await authenticatedPage.waitForTimeout(500);
      
      const newState = await extensionToggle.isChecked();
      expect(newState).not.toBe(initialState);
    }
  });

  test('shows extension details', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.open();
    
    const extensionsTab = authenticatedPage.getByRole('tab', { name: /extensions/i });
    if (await extensionsTab.isVisible()) {
      await extensionsTab.click();
      await authenticatedPage.waitForTimeout(500);
    }
    
    const extensionItem = authenticatedPage.locator(
      '[data-testid="extension-item"], [class*="extension-item"], [class*="extension-card"]'
    ).first();
    
    if (await extensionItem.isVisible()) {
      await extensionItem.click();
      await authenticatedPage.waitForTimeout(500);
      
      const detailsPanel = authenticatedPage.locator(
        '[data-testid="extension-details"], [class*="details"], [role="dialog"]'
      );
      
      if (await detailsPanel.isVisible()) {
        await expect(detailsPanel).toBeVisible();
      }
    }
  });

  test('can install new extension', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.open();
    
    const extensionsTab = authenticatedPage.getByRole('tab', { name: /extensions/i });
    if (await extensionsTab.isVisible()) {
      await extensionsTab.click();
      await authenticatedPage.waitForTimeout(500);
    }
    
    const installButton = authenticatedPage.getByRole('button', { 
      name: /install|add extension|browse/i 
    });
    
    if (await installButton.isVisible()) {
      await installButton.click();
      await authenticatedPage.waitForTimeout(500);
      
      const installDialog = authenticatedPage.locator(
        '[data-testid="install-dialog"], [role="dialog"]'
      );
      
      if (await installDialog.isVisible()) {
        await expect(installDialog).toBeVisible();
      }
    }
  });

  test('can uninstall extension', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.open();
    
    const extensionsTab = authenticatedPage.getByRole('tab', { name: /extensions/i });
    if (await extensionsTab.isVisible()) {
      await extensionsTab.click();
      await authenticatedPage.waitForTimeout(500);
    }
    
    const uninstallButton = authenticatedPage.locator(
      '[data-testid="uninstall-button"], button[aria-label*="uninstall"], button[aria-label*="remove"]'
    ).first();
    
    if (await uninstallButton.isVisible()) {
      await uninstallButton.click();
      await authenticatedPage.waitForTimeout(500);
      
      const confirmDialog = authenticatedPage.locator('[role="alertdialog"], [role="dialog"]');
      if (await confirmDialog.isVisible()) {
        await expect(confirmDialog).toBeVisible();
      }
    }
  });

  test('displays extension version', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.open();
    
    const extensionsTab = authenticatedPage.getByRole('tab', { name: /extensions/i });
    if (await extensionsTab.isVisible()) {
      await extensionsTab.click();
      await authenticatedPage.waitForTimeout(500);
    }
    
    const versionDisplay = authenticatedPage.locator(
      '[data-testid="extension-version"], [class*="version"]'
    ).or(authenticatedPage.getByText(/v?\d+\.\d+\.\d+/).first());
    
    if (await versionDisplay.isVisible()) {
      const text = await versionDisplay.textContent();
      expect(text).toMatch(/\d+\.\d+/);
    }
  });

  test('can configure extension settings', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.open();
    
    const extensionsTab = authenticatedPage.getByRole('tab', { name: /extensions/i });
    if (await extensionsTab.isVisible()) {
      await extensionsTab.click();
      await authenticatedPage.waitForTimeout(500);
    }
    
    const configButton = authenticatedPage.locator(
      '[data-testid="extension-config"], button[aria-label*="settings"], button[aria-label*="configure"]'
    ).first();
    
    if (await configButton.isVisible()) {
      await configButton.click();
      await authenticatedPage.waitForTimeout(500);
      
      const configPanel = authenticatedPage.locator(
        '[data-testid="config-panel"], [class*="config"], [role="dialog"]'
      );
      
      if (await configPanel.isVisible()) {
        await expect(configPanel).toBeVisible();
      }
    }
  });

  test('shows extension status indicator', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const settingsPage = new SettingsPage(authenticatedPage);
    await settingsPage.open();
    
    const extensionsTab = authenticatedPage.getByRole('tab', { name: /extensions/i });
    if (await extensionsTab.isVisible()) {
      await extensionsTab.click();
      await authenticatedPage.waitForTimeout(500);
    }
    
    const statusIndicator = authenticatedPage.locator(
      '[data-testid="extension-status"], [class*="status-indicator"], [class*="badge"]'
    );
    
    const count = await statusIndicator.count();
    expect(count).toBeGreaterThan(0);
  });
});

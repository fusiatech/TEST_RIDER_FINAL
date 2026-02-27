import { test, expect } from '@playwright/test';
// @ts-ignore - @axe-core/playwright needs to be installed
import AxeBuilder from '@axe-core/playwright';

interface AxeViolation {
  id: string;
  impact?: string | null;
  description: string;
  nodes: unknown[];
}

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('main page has no critical violations', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const criticalViolations = results.violations.filter(
      (v: AxeViolation) => v.impact === 'critical' || v.impact === 'serious'
    );

    if (criticalViolations.length > 0) {
      console.log('Critical violations:', JSON.stringify(criticalViolations, null, 2));
    }

    expect(criticalViolations).toEqual([]);
  });

  test('chat interface is accessible', async ({ page }) => {
    const chatInput = page.getByPlaceholder(/message|type|ask/i).or(
      page.locator('textarea').first()
    );

    if (await chatInput.isVisible()) {
      const results = await new AxeBuilder({ page })
        .include('main, [role="main"], .chat-container, [data-testid="chat"]')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v: AxeViolation) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations).toEqual([]);
    }
  });

  test('IDE tab is accessible', async ({ page }) => {
    const ideTab = page.getByRole('tab', { name: /ide/i }).or(
      page.getByText(/ide/i).first()
    );

    if (await ideTab.isVisible()) {
      await ideTab.click();
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v: AxeViolation) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations).toEqual([]);
    }
  });

  test('settings dialog is accessible', async ({ page }) => {
    const settingsButton = page.getByRole('button', { name: /settings/i }).or(
      page.locator('[data-testid="settings-button"], [aria-label*="settings" i]')
    );

    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const results = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v: AxeViolation) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations).toEqual([]);
    }
  });

  test('project dashboard is accessible', async ({ page }) => {
    const dashboardTab = page.getByRole('tab', { name: /dashboard|project/i }).or(
      page.getByText(/dashboard/i).first()
    );

    if (await dashboardTab.isVisible()) {
      await dashboardTab.click();
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v: AxeViolation) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations).toEqual([]);
    }
  });

  test('testing dashboard is accessible', async ({ page }) => {
    const testingTab = page.getByRole('tab', { name: /testing/i }).or(
      page.getByText(/testing/i).first()
    );

    if (await testingTab.isVisible()) {
      await testingTab.click();
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v: AxeViolation) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations).toEqual([]);
    }
  });

  test('keyboard navigation works', async ({ page }) => {
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }

    const stillFocused = await page.evaluate(() => document.activeElement?.tagName);
    expect(stillFocused).toBeTruthy();
  });

  test('focus indicators are visible', async ({ page }) => {
    const buttons = page.locator('button:visible').first();

    if (await buttons.isVisible()) {
      await buttons.focus();

      const hasVisibleFocus = await buttons.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        const hasOutline = styles.outline !== 'none' && styles.outline !== '';
        const hasRing = el.classList.toString().includes('ring') ||
          styles.boxShadow.includes('rgb');
        return hasOutline || hasRing;
      });

      expect(hasVisibleFocus).toBeTruthy();
    }
  });

  test('color contrast meets WCAG AA', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();

    const contrastViolations = results.violations.filter(
      (v: AxeViolation) => v.id === 'color-contrast' && (v.impact === 'critical' || v.impact === 'serious')
    );

    expect(contrastViolations).toEqual([]);
  });

  test('images have alt text', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withRules(['image-alt'])
      .analyze();

    expect(results.violations.filter((v: AxeViolation) => v.id === 'image-alt')).toEqual([]);
  });

  test('form inputs have labels', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withRules(['label', 'label-title-only'])
      .analyze();

    const labelViolations = results.violations.filter(
      (v: AxeViolation) => v.id === 'label' && v.impact === 'critical'
    );

    expect(labelViolations).toEqual([]);
  });

  test('ARIA attributes are valid', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withRules([
        'aria-allowed-attr',
        'aria-hidden-body',
        'aria-required-attr',
        'aria-required-children',
        'aria-required-parent',
        'aria-roles',
        'aria-valid-attr',
        'aria-valid-attr-value',
      ])
      .analyze();

    const ariaViolations = results.violations.filter(
      (v: AxeViolation) => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(ariaViolations).toEqual([]);
  });
});

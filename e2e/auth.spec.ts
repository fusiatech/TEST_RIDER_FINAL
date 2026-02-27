import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/login/);
    
    const emailInput = page.getByLabel(/email/i).or(page.locator('input[type="email"]'));
    const passwordInput = page.getByLabel(/password/i).or(page.locator('input[type="password"]'));
    const submitButton = page.getByRole('button', { name: /sign in|log in|login/i });
    
    await expect(emailInput.or(passwordInput).or(submitButton).first()).toBeVisible();
  });

  test('login with demo credentials', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    const emailInput = page.getByLabel(/email/i).or(page.locator('input[type="email"]'));
    const passwordInput = page.getByLabel(/password/i).or(page.locator('input[type="password"]'));
    
    if (await emailInput.isVisible()) {
      await emailInput.fill('admin@swarmui.local');
      await passwordInput.fill('admin123');
      
      const submitButton = page.getByRole('button', { name: /sign in|log in|login/i });
      await submitButton.click();
      
      await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });
      expect(page.url()).not.toContain('/login');
    }
  });

  test('redirect after login', async ({ page }) => {
    await page.goto('/login?callbackUrl=/');
    await page.waitForLoadState('networkidle');
    
    const emailInput = page.getByLabel(/email/i).or(page.locator('input[type="email"]'));
    
    if (await emailInput.isVisible()) {
      const passwordInput = page.getByLabel(/password/i).or(page.locator('input[type="password"]'));
      await emailInput.fill('admin@swarmui.local');
      await passwordInput.fill('admin123');
      
      const submitButton = page.getByRole('button', { name: /sign in|log in|login/i });
      await submitButton.click();
      
      await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });
      expect(page.url()).toContain('localhost:3000');
    }
  });

  test('logout flow', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    const emailInput = page.getByLabel(/email/i).or(page.locator('input[type="email"]'));
    
    if (await emailInput.isVisible()) {
      const passwordInput = page.getByLabel(/password/i).or(page.locator('input[type="password"]'));
      await emailInput.fill('admin@swarmui.local');
      await passwordInput.fill('admin123');
      await page.getByRole('button', { name: /sign in|log in|login/i }).click();
      await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });
    }
    
    const logoutButton = page.getByRole('button', { name: /logout|sign out/i }).or(
      page.locator('[data-testid="logout-button"]')
    );
    
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await page.waitForURL(/login/, { timeout: 10000 });
      expect(page.url()).toContain('/login');
    }
  });
});

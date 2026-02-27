import { test as base, expect, Page } from '@playwright/test';
// @ts-ignore - @axe-core/playwright needs to be installed
import AxeBuilder from '@axe-core/playwright';

type TestFixtures = {
  authenticatedPage: Page;
  testProject: { id: string; name: string };
};

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    const emailInput = page.getByLabel(/email/i).or(page.locator('input[type="email"]'));
    const passwordInput = page.getByLabel(/password/i).or(page.locator('input[type="password"]'));
    
    if (await emailInput.isVisible()) {
      await emailInput.fill('admin@swarmui.local');
      await passwordInput.fill('admin123');
      await page.getByRole('button', { name: /sign in|log in|login/i }).click();
      await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });
    }
    
    await use(page);
  },

  testProject: async ({ authenticatedPage }, use) => {
    const projectName = `Test Project ${Date.now()}`;
    
    await authenticatedPage.goto('/');
    
    const createButton = authenticatedPage.getByRole('button', { name: /new project|create project/i });
    if (await createButton.isVisible()) {
      await createButton.click();
      
      const nameInput = authenticatedPage.getByLabel(/name/i).or(authenticatedPage.locator('input[name="name"]'));
      if (await nameInput.isVisible()) {
        await nameInput.fill(projectName);
        await authenticatedPage.getByRole('button', { name: /create|save/i }).click();
        await authenticatedPage.waitForTimeout(1000);
      }
    }
    
    await use({ id: 'test-project-id', name: projectName });
  },
});

export { expect };

export async function checkAccessibility(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  if (results.violations.length > 0) {
    console.log(`Accessibility violations for ${name}:`, JSON.stringify(results.violations, null, 2));
  }

  return results;
}

export async function assertAccessibility(page: Page, name: string) {
  const results = await checkAccessibility(page, name);
  expect(results.violations, `Accessibility violations found on ${name}`).toEqual([]);
}

export class ChatPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async sendMessage(message: string) {
    const input = this.page.getByPlaceholder(/message|type|ask/i).or(
      this.page.locator('textarea').first()
    );
    await input.fill(message);
    await this.page.keyboard.press('Enter');
  }

  async waitForResponse() {
    await this.page.waitForSelector('[data-testid="message"], .message, [class*="message"]', {
      timeout: 30000,
    });
  }

  async getMessages() {
    return this.page.locator('[data-testid="message"], .message, [class*="message"]').all();
  }

  async switchMode(mode: 'chat' | 'swarm' | 'project') {
    const modeSelector = this.page.getByRole('button', { name: new RegExp(mode, 'i') }).or(
      this.page.locator(`[data-mode="${mode}"]`)
    );
    if (await modeSelector.isVisible()) {
      await modeSelector.click();
    }
  }
}

export class IDEPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/');
    const ideTab = this.page.getByRole('tab', { name: /ide/i }).or(
      this.page.getByText(/ide/i).first()
    );
    if (await ideTab.isVisible()) {
      await ideTab.click();
    }
    await this.page.waitForLoadState('networkidle');
  }

  async getFileBrowser() {
    return this.page.locator('[data-testid="file-browser"], [class*="file-tree"], [class*="file-browser"]');
  }

  async openFile(filename: string) {
    const fileItem = this.page.getByText(filename).first();
    if (await fileItem.isVisible()) {
      await fileItem.click();
    }
  }

  async getEditor() {
    return this.page.locator('.monaco-editor, [data-testid="editor"]');
  }

  async getTerminal() {
    return this.page.locator('[data-testid="terminal"], [class*="terminal"], .xterm');
  }
}

export class ProjectPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/');
    const projectTab = this.page.getByRole('tab', { name: /project|dashboard/i }).or(
      this.page.getByText(/project/i).first()
    );
    if (await projectTab.isVisible()) {
      await projectTab.click();
    }
    await this.page.waitForLoadState('networkidle');
  }

  async createTicket(title: string, description?: string) {
    const createButton = this.page.getByRole('button', { name: /new ticket|create ticket|add ticket/i });
    if (await createButton.isVisible()) {
      await createButton.click();
      
      const titleInput = this.page.getByLabel(/title/i).or(this.page.locator('input[name="title"]'));
      await titleInput.fill(title);
      
      if (description) {
        const descInput = this.page.getByLabel(/description/i).or(this.page.locator('textarea[name="description"]'));
        if (await descInput.isVisible()) {
          await descInput.fill(description);
        }
      }
      
      await this.page.getByRole('button', { name: /create|save|submit/i }).click();
    }
  }

  async getKanbanColumns() {
    return this.page.locator('[data-testid="kanban-column"], [class*="kanban-column"], [class*="column"]').all();
  }

  async getTickets() {
    return this.page.locator('[data-testid="ticket"], [class*="ticket-card"], [class*="ticket"]').all();
  }
}

export class SettingsPage {
  constructor(private page: Page) {}

  async open() {
    const settingsButton = this.page.getByRole('button', { name: /settings/i }).or(
      this.page.locator('[data-testid="settings-button"], [aria-label*="settings" i]')
    );
    await settingsButton.click();
    await this.page.waitForSelector('[role="dialog"], [data-testid="settings-dialog"], [class*="settings"]');
  }

  async close() {
    const closeButton = this.page.getByRole('button', { name: /close|cancel/i }).or(
      this.page.locator('[data-testid="close-button"]')
    );
    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
  }

  async getDialog() {
    return this.page.locator('[role="dialog"], [data-testid="settings-dialog"]');
  }

  async toggleSetting(settingName: string) {
    const toggle = this.page.getByLabel(new RegExp(settingName, 'i')).or(
      this.page.locator(`[data-setting="${settingName}"] input[type="checkbox"]`)
    );
    if (await toggle.isVisible()) {
      await toggle.click();
    }
  }
}

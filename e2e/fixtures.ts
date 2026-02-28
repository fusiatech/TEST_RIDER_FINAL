import { test as base, expect, Page } from '@playwright/test';
// @ts-ignore - @axe-core/playwright needs to be installed
import AxeBuilder from '@axe-core/playwright';

type TestFixtures = {
  authenticatedPage: Page;
  testProject: { id: string; name: string };
};

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    const fallbackEmail = `e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@fusia.local`;
    const fallbackPassword = 'E2Epass123!';

    const signIn = async (email: string, password: string) => {
      await page.goto('/login?callbackUrl=/app');
      await page.waitForLoadState('networkidle');

      const emailInput = page.locator('input[type="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      await emailInput.fill(email);
      await passwordInput.fill(password);
      await page.getByRole('button', { name: /sign in|log in|login/i }).click();

      try {
        await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
      } catch {
        // handled by caller
      }
    };

    await signIn('admin@swarmui.local', 'admin123');
    const stillOnLogin = page.url().includes('/login');

    if (stillOnLogin) {
      await page.goto('/register');
      await page.waitForLoadState('networkidle');

      await page.locator('#name').fill('E2E User');
      await page.locator('#email').fill(fallbackEmail);
      await page.locator('#password').fill(fallbackPassword);
      await page.getByRole('button', { name: /create account/i }).click();
      await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 10000 });

      await signIn(fallbackEmail, fallbackPassword);
    }

    await page.goto('/app');
    await page.waitForLoadState('networkidle');
    if (page.url().includes('/login')) {
      throw new Error('Authentication failed for E2E fixture.');
    }
    await use(page);
  },

  testProject: async ({ authenticatedPage }, use) => {
    const projectName = `Test Project ${Date.now()}`;
    
    await authenticatedPage.goto('/app');
    await authenticatedPage.waitForLoadState('networkidle');

    const startWork = authenticatedPage.locator('[data-action-id="start-work-menu-trigger"]');
    if (await startWork.isVisible()) {
      await startWork.click();
      await authenticatedPage.locator('[data-action-id="start-work-new-project"]').click();
      const nameInput = authenticatedPage.getByLabel(/name/i).or(authenticatedPage.locator('input[name="name"]')).first();
      if (await nameInput.isVisible()) {
        await nameInput.fill(projectName);
        await authenticatedPage.getByRole('button', { name: /create|save/i }).first().click();
        await authenticatedPage.waitForTimeout(800);
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
    await this.page.goto('/app');
    await this.page.waitForLoadState('networkidle');
  }

  async sendMessage(message: string) {
    const input = this.page.locator('textarea#chat-input, [data-testid="chat-input"] textarea, textarea').first();
    await input.fill(message);
    await this.page.keyboard.press('Enter');
  }

  async waitForResponse() {
    await this.page.waitForSelector('[data-testid="message"]', {
      timeout: 30000,
    });
  }

  async getMessages() {
    return this.page.locator('[data-testid="message"]').all();
  }

  async startWork(action: 'conversation' | 'project' | 'run' | 'multi-agent') {
    await this.page.locator('[data-action-id="start-work-menu-trigger"]').click();
    const actionId = action === 'conversation'
      ? 'start-work-new-conversation'
      : action === 'project'
        ? 'start-work-new-project'
        : action === 'multi-agent'
          ? 'start-work-new-swarm-run'
          : 'start-work-new-run'
    await this.page.locator(`[data-action-id="${actionId}"]`).click();
  }

  async switchMode(mode: 'chat' | 'swarm' | 'project') {
    if (mode === 'chat') {
      await this.startWork('conversation')
      return
    }
    if (mode === 'swarm') {
      await this.startWork('multi-agent')
      return
    }
    await this.startWork('project')
  }
}

export class IDEPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/app');
    await this.page.locator('[data-action-id="rail-nav-ide"]').click();
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
    await this.page.goto('/app');
    await this.page.locator('[data-action-id="rail-nav-dashboard"]').click();
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
    await this.page.goto('/settings');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForSelector('h1, h2');
  }

  async close() {
    const backButton = this.page.locator('[data-action-id="settings-back-to-app"]');
    if (await backButton.isVisible()) {
      await backButton.click();
    } else {
      await this.page.goto('/app');
    }
  }

  async getDialog() {
    return this.page.locator('main, [data-testid="settings-page"], body');
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

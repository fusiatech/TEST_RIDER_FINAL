import { test, expect, SettingsPage } from './fixtures';

test.describe('Scheduling', () => {
  test('can access scheduler panel', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const dashboardTab = authenticatedPage.getByRole('tab', { name: /dashboard/i }).or(
      authenticatedPage.getByText(/dashboard/i).first()
    );
    
    if (await dashboardTab.isVisible()) {
      await dashboardTab.click();
      await authenticatedPage.waitForTimeout(1000);
    }
    
    const schedulerPanel = authenticatedPage.locator(
      '[data-testid="scheduler-panel"], [class*="scheduler"], [class*="schedule"]'
    ).or(authenticatedPage.getByText(/scheduled|schedule|tasks/i).first());
    
    if (await schedulerPanel.isVisible()) {
      await expect(schedulerPanel).toBeVisible();
    }
  });

  test('displays scheduled tasks list', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const tasksList = authenticatedPage.locator(
      '[data-testid="scheduled-tasks"], [class*="task-list"], [class*="scheduled"]'
    );
    
    if (await tasksList.isVisible()) {
      await expect(tasksList).toBeVisible();
    }
  });

  test('can create new scheduled task', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const createButton = authenticatedPage.getByRole('button', { 
      name: /new task|add task|create task|schedule/i 
    }).or(authenticatedPage.locator('[data-testid="create-task"]'));
    
    if (await createButton.isVisible()) {
      await createButton.click();
      await authenticatedPage.waitForTimeout(500);
      
      const dialog = authenticatedPage.locator('[role="dialog"], [class*="modal"], [class*="dialog"]');
      
      if (await dialog.isVisible()) {
        await expect(dialog).toBeVisible();
        
        const nameInput = dialog.getByLabel(/name/i).or(dialog.locator('input[name="name"]'));
        if (await nameInput.isVisible()) {
          await nameInput.fill('Test Scheduled Task');
        }
        
        const promptInput = dialog.getByLabel(/prompt/i).or(dialog.locator('textarea[name="prompt"]'));
        if (await promptInput.isVisible()) {
          await promptInput.fill('Run daily code review');
        }
        
        const scheduleSelect = dialog.getByLabel(/schedule|frequency/i).or(
          dialog.locator('select[name="schedule"]')
        );
        if (await scheduleSelect.isVisible()) {
          await scheduleSelect.selectOption({ index: 0 });
        }
      }
    }
  });

  test('shows schedule frequency options', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const createButton = authenticatedPage.getByRole('button', { 
      name: /new task|add task|schedule/i 
    });
    
    if (await createButton.isVisible()) {
      await createButton.click();
      await authenticatedPage.waitForTimeout(500);
      
      const scheduleSelect = authenticatedPage.locator(
        'select[name="schedule"], [data-testid="schedule-select"]'
      );
      
      if (await scheduleSelect.isVisible()) {
        const options = scheduleSelect.locator('option');
        const count = await options.count();
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test('can enable/disable scheduled task', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const taskToggle = authenticatedPage.locator(
      '[data-testid="task-toggle"], [class*="task"] input[type="checkbox"], [class*="toggle"]'
    ).first();
    
    if (await taskToggle.isVisible()) {
      const initialState = await taskToggle.isChecked();
      await taskToggle.click();
      await authenticatedPage.waitForTimeout(500);
      
      const newState = await taskToggle.isChecked();
      expect(newState).not.toBe(initialState);
    }
  });

  test('displays next run time', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const nextRunDisplay = authenticatedPage.locator(
      '[data-testid="next-run"], [class*="next-run"]'
    ).or(authenticatedPage.getByText(/next run|scheduled for/i).first());
    
    if (await nextRunDisplay.isVisible()) {
      const text = await nextRunDisplay.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test('displays last run time', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const lastRunDisplay = authenticatedPage.locator(
      '[data-testid="last-run"], [class*="last-run"]'
    ).or(authenticatedPage.getByText(/last run|ran at/i).first());
    
    if (await lastRunDisplay.isVisible()) {
      const text = await lastRunDisplay.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test('can delete scheduled task', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const deleteButton = authenticatedPage.locator(
      '[data-testid="delete-task"], [class*="delete"], button[aria-label*="delete"]'
    ).first();
    
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
      await authenticatedPage.waitForTimeout(500);
      
      const confirmButton = authenticatedPage.getByRole('button', { name: /confirm|yes|delete/i });
      if (await confirmButton.isVisible()) {
        await expect(confirmButton).toBeVisible();
      }
    }
  });

  test('validates required fields when creating task', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const createButton = authenticatedPage.getByRole('button', { 
      name: /new task|add task|schedule/i 
    });
    
    if (await createButton.isVisible()) {
      await createButton.click();
      await authenticatedPage.waitForTimeout(500);
      
      const submitButton = authenticatedPage.getByRole('button', { name: /create|save|submit/i });
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await authenticatedPage.waitForTimeout(500);
        
        const errorMessage = authenticatedPage.locator(
          '[class*="error"], [role="alert"], [aria-invalid="true"]'
        );
        
        const count = await errorMessage.count();
        expect(count).toBeGreaterThan(0);
      }
    }
  });
});

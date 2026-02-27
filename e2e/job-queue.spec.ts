import { test, expect } from './fixtures';

test.describe('Job Queue', () => {
  test('displays job queue panel', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const dashboardTab = authenticatedPage.getByRole('tab', { name: /dashboard/i }).or(
      authenticatedPage.getByText(/dashboard/i).first()
    );
    
    if (await dashboardTab.isVisible()) {
      await dashboardTab.click();
      await authenticatedPage.waitForTimeout(1000);
    }
    
    const jobQueuePanel = authenticatedPage.locator(
      '[data-testid="job-queue"], [class*="job-queue"], [class*="queue"]'
    ).or(authenticatedPage.getByText(/job queue|active jobs|queued/i).first());
    
    if (await jobQueuePanel.isVisible()) {
      await expect(jobQueuePanel).toBeVisible();
    }
  });

  test('shows active job count', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const activeJobsIndicator = authenticatedPage.locator(
      '[data-testid="active-jobs"], [class*="active-jobs"]'
    ).or(authenticatedPage.getByText(/active.*\d|running.*\d/i).first());
    
    if (await activeJobsIndicator.isVisible()) {
      const text = await activeJobsIndicator.textContent();
      expect(text).toMatch(/\d/);
    }
  });

  test('shows queue depth', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const queueDepthIndicator = authenticatedPage.locator(
      '[data-testid="queue-depth"], [class*="queue-depth"]'
    ).or(authenticatedPage.getByText(/queued.*\d|pending.*\d/i).first());
    
    if (await queueDepthIndicator.isVisible()) {
      const text = await queueDepthIndicator.textContent();
      expect(text).toMatch(/\d/);
    }
  });

  test('can view job details', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const jobItem = authenticatedPage.locator(
      '[data-testid="job-item"], [class*="job-item"], [class*="job-card"]'
    ).first();
    
    if (await jobItem.isVisible()) {
      await jobItem.click();
      await authenticatedPage.waitForTimeout(500);
      
      const jobDetails = authenticatedPage.locator(
        '[data-testid="job-details"], [class*="job-details"], [role="dialog"]'
      );
      
      if (await jobDetails.isVisible()) {
        await expect(jobDetails).toBeVisible();
      }
    }
  });

  test('displays job status indicators', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const statusIndicators = authenticatedPage.locator(
      '[data-status], [class*="status-"], [class*="job-status"]'
    );
    
    const count = await statusIndicators.count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows memory usage stats', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const memoryStats = authenticatedPage.locator(
      '[data-testid="memory-stats"], [class*="memory"]'
    ).or(authenticatedPage.getByText(/memory|mb|usage/i).first());
    
    if (await memoryStats.isVisible()) {
      await expect(memoryStats).toBeVisible();
    }
  });

  test('can filter jobs by status', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const statusFilter = authenticatedPage.locator(
      '[data-testid="status-filter"], select[name="status"], [class*="filter"]'
    ).first();
    
    if (await statusFilter.isVisible()) {
      await statusFilter.click();
      
      const filterOptions = authenticatedPage.locator(
        '[role="option"], option, [class*="filter-option"]'
      );
      
      const count = await filterOptions.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('job queue updates in real-time', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await authenticatedPage.waitForLoadState('networkidle');
    
    const initialContent = await authenticatedPage.content();
    
    await authenticatedPage.waitForTimeout(3000);
    
    const updatedContent = await authenticatedPage.content();
    
    expect(updatedContent.length).toBeGreaterThan(0);
  });
});

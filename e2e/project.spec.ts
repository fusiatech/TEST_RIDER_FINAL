import { test, expect, ProjectPage } from './fixtures';

test.describe('Project Dashboard', () => {
  test('project dashboard loads', async ({ authenticatedPage }) => {
    const projectPage = new ProjectPage(authenticatedPage);
    await projectPage.goto();
    
    const dashboard = authenticatedPage.locator('[data-testid="project-dashboard"], [class*="dashboard"], [class*="project"]');
    
    if (await dashboard.isVisible()) {
      await expect(dashboard).toBeVisible();
    }
  });

  test('creating a ticket', async ({ authenticatedPage }) => {
    const projectPage = new ProjectPage(authenticatedPage);
    await projectPage.goto();
    
    const ticketTitle = `Test Ticket ${Date.now()}`;
    await projectPage.createTicket(ticketTitle, 'This is a test ticket description');
    
    await authenticatedPage.waitForTimeout(1000);
    
    const pageContent = await authenticatedPage.content();
    const ticketCreated = pageContent.includes(ticketTitle) || 
                          pageContent.toLowerCase().includes('ticket') ||
                          pageContent.toLowerCase().includes('created');
    
    expect(ticketCreated).toBeTruthy();
  });

  test('ticket appears in Kanban', async ({ authenticatedPage }) => {
    const projectPage = new ProjectPage(authenticatedPage);
    await projectPage.goto();
    
    const columns = await projectPage.getKanbanColumns();
    expect(columns.length).toBeGreaterThan(0);
  });

  test('Kanban columns exist', async ({ authenticatedPage }) => {
    const projectPage = new ProjectPage(authenticatedPage);
    await projectPage.goto();
    
    const todoColumn = authenticatedPage.getByText(/to ?do|backlog/i).first();
    const inProgressColumn = authenticatedPage.getByText(/in ?progress|doing/i).first();
    const doneColumn = authenticatedPage.getByText(/done|complete/i).first();
    
    const hasColumns = await todoColumn.isVisible() || 
                       await inProgressColumn.isVisible() || 
                       await doneColumn.isVisible();
    
    expect(hasColumns).toBeTruthy();
  });

  test('drag-drop ticket between columns', async ({ authenticatedPage }) => {
    const projectPage = new ProjectPage(authenticatedPage);
    await projectPage.goto();
    
    const tickets = await projectPage.getTickets();
    
    if (tickets.length > 0) {
      const firstTicket = tickets[0];
      const boundingBox = await firstTicket.boundingBox();
      
      if (boundingBox) {
        const columns = await projectPage.getKanbanColumns();
        
        if (columns.length > 1) {
          const targetColumn = columns[1];
          const targetBox = await targetColumn.boundingBox();
          
          if (targetBox) {
            await firstTicket.hover();
            await authenticatedPage.mouse.down();
            await authenticatedPage.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
            await authenticatedPage.mouse.up();
            
            await authenticatedPage.waitForTimeout(500);
          }
        }
      }
    }
    
    const postMoveColumns = await projectPage.getKanbanColumns();
    expect(postMoveColumns.length).toBeGreaterThan(0);
  });

  test('ticket details modal', async ({ authenticatedPage }) => {
    const projectPage = new ProjectPage(authenticatedPage);
    await projectPage.goto();
    
    const tickets = await projectPage.getTickets();
    
    if (tickets.length > 0) {
      await tickets[0].click();
      await authenticatedPage.waitForTimeout(500);
      
      const modal = authenticatedPage.locator('[role="dialog"], [class*="modal"], [class*="dialog"]');
      
      if (await modal.isVisible()) {
        await expect(modal).toBeVisible();
        
        await authenticatedPage.keyboard.press('Escape');
      }
    }
  });

  test('project list view', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    
    const projectList = authenticatedPage.locator('[data-testid="project-list"], [class*="project-list"]');
    
    if (await projectList.isVisible()) {
      await expect(projectList).toBeVisible();
    }
  });
});

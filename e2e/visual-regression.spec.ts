import { test, expect } from '@playwright/test'

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('chat page matches snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('chat-page.png', {
      maxDiffPixels: 100,
      threshold: 0.2,
    })
  })

  test('chat page dark mode matches snapshot', async ({ page }) => {
    // Toggle dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
    })
    await page.waitForTimeout(500)
    
    await expect(page).toHaveScreenshot('chat-page-dark.png', {
      maxDiffPixels: 100,
      threshold: 0.2,
    })
  })

  test('chat tab visual', async ({ page }) => {
    await page.goto('/?tab=chat')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('chat-tab.png', {
      maxDiffPixels: 100,
    })
  })

  test('chat tab dark mode', async ({ page }) => {
    await page.goto('/?tab=chat')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('chat-tab-dark.png', {
      maxDiffPixels: 100,
    })
  })

  test('dashboard tab agent mode', async ({ page }) => {
    await page.goto('/?tab=dashboard&mode=agent')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('dashboard-agent-mode.png', {
      maxDiffPixels: 150,
      threshold: 0.2,
    })
  })

  test('dashboard tab agent mode dark', async ({ page }) => {
    await page.goto('/?tab=dashboard&mode=agent')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('dashboard-agent-mode-dark.png', {
      maxDiffPixels: 150,
      threshold: 0.2,
    })
  })

  test('dashboard tab project mode with kanban', async ({ page }) => {
    await page.goto('/?tab=dashboard&mode=project')
    await page.waitForLoadState('networkidle')
    
    // Wait for kanban board to render if present
    const kanban = page.locator('[data-testid="kanban-board"]').or(
      page.locator('.kanban-board')
    )
    if (await kanban.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.waitForTimeout(500)
    }
    
    await expect(page).toHaveScreenshot('dashboard-project-kanban.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    })
  })

  test('dashboard tab project mode kanban dark', async ({ page }) => {
    await page.goto('/?tab=dashboard&mode=project')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('dashboard-project-kanban-dark.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    })
  })

  test('IDE tab matches snapshot', async ({ page }) => {
    const ideTab = page.getByRole('tab', { name: /ide/i }).or(
      page.getByText(/ide/i).first()
    )
    if (await ideTab.isVisible()) {
      await ideTab.click()
      await page.waitForTimeout(1000)
    }
    
    await expect(page).toHaveScreenshot('ide-page.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    })
  })

  test('IDE tab with file open', async ({ page }) => {
    await page.goto('/?tab=ide')
    await page.waitForLoadState('networkidle')
    
    // Try to open a file from the file browser
    const fileItem = page.locator('[data-testid="file-item"]').first().or(
      page.locator('.file-tree-item').first()
    )
    if (await fileItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fileItem.click()
      await page.waitForTimeout(1000)
    }
    
    await expect(page).toHaveScreenshot('ide-tab-file-open.png', {
      maxDiffPixels: 250,
      threshold: 0.2,
    })
  })

  test('IDE tab dark mode', async ({ page }) => {
    await page.goto('/?tab=ide')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('ide-tab-dark.png', {
      maxDiffPixels: 250,
      threshold: 0.2,
    })
  })

  test('settings dialog matches snapshot', async ({ page }) => {
    const settingsButton = page.getByRole('button', { name: /settings/i }).or(
      page.locator('[data-testid="settings-button"]')
    )
    if (await settingsButton.isVisible()) {
      await settingsButton.click()
      await page.waitForTimeout(500)
    }
    
    await expect(page).toHaveScreenshot('settings-dialog.png', {
      maxDiffPixels: 100,
      threshold: 0.2,
    })
  })

  test('settings dialog dark mode', async ({ page }) => {
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    
    const settingsButton = page.getByRole('button', { name: /settings/i }).or(
      page.locator('[data-testid="settings-button"]')
    )
    if (await settingsButton.isVisible()) {
      await settingsButton.click()
      await page.waitForTimeout(500)
    }
    
    await expect(page).toHaveScreenshot('settings-dialog-dark.png', {
      maxDiffPixels: 100,
      threshold: 0.2,
    })
  })

  test('create ticket dialog', async ({ page }) => {
    await page.goto('/?tab=dashboard&mode=project')
    await page.waitForLoadState('networkidle')
    
    // Try to open create ticket dialog
    const createButton = page.getByRole('button', { name: /create.*ticket/i }).or(
      page.getByRole('button', { name: /new.*ticket/i }).or(
        page.locator('[data-testid="create-ticket-button"]')
      )
    )
    if (await createButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createButton.click()
      await page.waitForTimeout(500)
    }
    
    await expect(page).toHaveScreenshot('create-ticket-dialog.png', {
      maxDiffPixels: 150,
      threshold: 0.2,
    })
  })

  test('create ticket dialog dark mode', async ({ page }) => {
    await page.goto('/?tab=dashboard&mode=project')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForLoadState('networkidle')
    
    const createButton = page.getByRole('button', { name: /create.*ticket/i }).or(
      page.getByRole('button', { name: /new.*ticket/i }).or(
        page.locator('[data-testid="create-ticket-button"]')
      )
    )
    if (await createButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createButton.click()
      await page.waitForTimeout(500)
    }
    
    await expect(page).toHaveScreenshot('create-ticket-dialog-dark.png', {
      maxDiffPixels: 150,
      threshold: 0.2,
    })
  })

  test('onboarding modal if visible', async ({ page }) => {
    // Clear any stored onboarding completion state
    await page.evaluate(() => {
      localStorage.removeItem('onboarding-complete')
      localStorage.removeItem('onboardingComplete')
    })
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    const onboardingModal = page.locator('[data-testid="onboarding-modal"]').or(
      page.getByRole('dialog').filter({ hasText: /welcome|get started|onboarding/i })
    )
    
    if (await onboardingModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(page).toHaveScreenshot('onboarding-modal.png', {
        maxDiffPixels: 150,
        threshold: 0.2,
      })
    }
  })

  test('onboarding modal dark mode', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('onboarding-complete')
      localStorage.removeItem('onboardingComplete')
      document.documentElement.classList.add('dark')
    })
    await page.reload()
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForLoadState('networkidle')
    
    const onboardingModal = page.locator('[data-testid="onboarding-modal"]').or(
      page.getByRole('dialog').filter({ hasText: /welcome|get started|onboarding/i })
    )
    
    if (await onboardingModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(page).toHaveScreenshot('onboarding-modal-dark.png', {
        maxDiffPixels: 150,
        threshold: 0.2,
      })
    }
  })

  test('testing dashboard matches snapshot', async ({ page }) => {
    const testingTab = page.getByRole('tab', { name: /testing/i }).or(
      page.getByText(/testing/i).first()
    )
    if (await testingTab.isVisible()) {
      await testingTab.click()
      await page.waitForTimeout(1000)
    }
    
    await expect(page).toHaveScreenshot('testing-dashboard.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    })
  })

  test('testing dashboard tab visual', async ({ page }) => {
    await page.goto('/?tab=testing')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('testing-dashboard-tab.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    })
  })

  test('testing dashboard dark mode', async ({ page }) => {
    await page.goto('/?tab=testing')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('testing-dashboard-dark.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    })
  })

  test('eclipse dashboard matches snapshot', async ({ page }) => {
    const eclipseTab = page.getByRole('tab', { name: /eclipse/i }).or(
      page.getByText(/eclipse/i).first()
    )
    if (await eclipseTab.isVisible()) {
      await eclipseTab.click()
      await page.waitForTimeout(1000)
    }
    
    await expect(page).toHaveScreenshot('eclipse-dashboard.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    })
  })

  test('empty state matches snapshot', async ({ page }) => {
    // Navigate to a page that shows empty state
    await page.goto('/?tab=dashboard')
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('empty-state.png', {
      maxDiffPixels: 100,
      threshold: 0.2,
    })
  })
})

test.describe('Component Visual Tests', () => {
  test('button variants match snapshot', async ({ page }) => {
    await page.setContent(`
      <div style="padding: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="bg-primary text-primary-foreground px-4 py-2 rounded">Primary</button>
        <button class="bg-secondary text-secondary-foreground px-4 py-2 rounded">Secondary</button>
        <button class="bg-destructive text-destructive-foreground px-4 py-2 rounded">Destructive</button>
        <button class="border border-input px-4 py-2 rounded">Outline</button>
        <button class="px-4 py-2 rounded hover:bg-accent">Ghost</button>
      </div>
    `)
    
    await expect(page).toHaveScreenshot('button-variants.png', {
      maxDiffPixels: 50,
    })
  })

  test('badge variants match snapshot', async ({ page }) => {
    await page.setContent(`
      <div style="padding: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
        <span class="bg-primary text-primary-foreground px-2 py-1 rounded-full text-xs">Default</span>
        <span class="bg-secondary text-secondary-foreground px-2 py-1 rounded-full text-xs">Secondary</span>
        <span class="bg-destructive text-destructive-foreground px-2 py-1 rounded-full text-xs">Destructive</span>
        <span class="border px-2 py-1 rounded-full text-xs">Outline</span>
      </div>
    `)
    
    await expect(page).toHaveScreenshot('badge-variants.png', {
      maxDiffPixels: 50,
    })
  })
})

test.describe('Responsive Visual Tests', () => {
  test('mobile viewport matches snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('mobile-viewport.png', {
      maxDiffPixels: 150,
      threshold: 0.2,
    })
  })

  test('tablet viewport matches snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('tablet-viewport.png', {
      maxDiffPixels: 150,
      threshold: 0.2,
    })
  })
})

test.describe('Mobile Visual Regression', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('chat tab mobile', async ({ page }) => {
    await page.goto('/?tab=chat')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('chat-tab-mobile.png', {
      maxDiffPixels: 100,
    })
  })

  test('chat tab mobile dark mode', async ({ page }) => {
    await page.goto('/?tab=chat')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('chat-tab-mobile-dark.png', {
      maxDiffPixels: 100,
    })
  })

  test('dashboard tab mobile', async ({ page }) => {
    await page.goto('/?tab=dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('dashboard-tab-mobile.png', {
      maxDiffPixels: 100,
    })
  })

  test('dashboard tab mobile dark mode', async ({ page }) => {
    await page.goto('/?tab=dashboard')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('dashboard-tab-mobile-dark.png', {
      maxDiffPixels: 100,
    })
  })

  test('IDE tab mobile', async ({ page }) => {
    await page.goto('/?tab=ide')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('ide-tab-mobile.png', {
      maxDiffPixels: 150,
    })
  })

  test('testing dashboard mobile', async ({ page }) => {
    await page.goto('/?tab=testing')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('testing-dashboard-mobile.png', {
      maxDiffPixels: 150,
    })
  })

  test('settings dialog mobile', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const settingsButton = page.getByRole('button', { name: /settings/i }).or(
      page.locator('[data-testid="settings-button"]')
    )
    if (await settingsButton.isVisible()) {
      await settingsButton.click()
      await page.waitForTimeout(500)
    }
    
    await expect(page).toHaveScreenshot('settings-dialog-mobile.png', {
      maxDiffPixels: 150,
    })
  })
})

const MOBILE_VIEWPORTS = {
  'iphone-se': { width: 375, height: 667 },
  'iphone-14-pro': { width: 393, height: 852 },
  'ipad-mini': { width: 768, height: 1024 },
  'ipad-pro': { width: 1024, height: 1366 },
} as const

test.describe('Mobile Viewport Tests', () => {
  for (const [device, viewport] of Object.entries(MOBILE_VIEWPORTS)) {
    test.describe(`${device} (${viewport.width}x${viewport.height})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize(viewport)
      })

      test('chat page renders correctly', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')
        
        await expect(page).toHaveScreenshot(`${device}-chat-page.png`, {
          maxDiffPixels: 200,
          threshold: 0.25,
        })
      })

      test('IDE tab renders correctly', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')
        
        const ideTab = page.getByRole('tab', { name: /ide/i }).or(
          page.getByText(/ide/i).first()
        )
        if (await ideTab.isVisible()) {
          await ideTab.click()
          await page.waitForTimeout(1000)
        }
        
        await expect(page).toHaveScreenshot(`${device}-ide-page.png`, {
          maxDiffPixels: 250,
          threshold: 0.25,
        })
      })

      test('testing dashboard renders correctly', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')
        
        const testingTab = page.getByRole('tab', { name: /testing/i }).or(
          page.getByText(/testing/i).first()
        )
        if (await testingTab.isVisible()) {
          await testingTab.click()
          await page.waitForTimeout(1000)
        }
        
        await expect(page).toHaveScreenshot(`${device}-testing-dashboard.png`, {
          maxDiffPixels: 250,
          threshold: 0.25,
        })
      })

      test('settings dialog renders correctly', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')
        
        const settingsButton = page.getByRole('button', { name: /settings/i }).or(
          page.locator('[data-testid="settings-button"]')
        )
        if (await settingsButton.isVisible()) {
          await settingsButton.click()
          await page.waitForTimeout(500)
        }
        
        await expect(page).toHaveScreenshot(`${device}-settings-dialog.png`, {
          maxDiffPixels: 200,
          threshold: 0.25,
        })
      })
    })
  }
})

test.describe('Mobile Touch Interaction Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
  })

  test('sidebar toggle works on mobile', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const menuButton = page.getByRole('button', { name: /menu/i }).or(
      page.locator('[data-testid="menu-toggle"]').or(
        page.locator('button').filter({ has: page.locator('svg.lucide-menu') })
      )
    )
    
    if (await menuButton.isVisible()) {
      await expect(page).toHaveScreenshot('mobile-sidebar-closed.png', {
        maxDiffPixels: 200,
        threshold: 0.25,
      })
      
      await menuButton.tap()
      await page.waitForTimeout(500)
      
      await expect(page).toHaveScreenshot('mobile-sidebar-open.png', {
        maxDiffPixels: 200,
        threshold: 0.25,
      })
    }
  })

  test('tab navigation works with touch', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const tabs = page.getByRole('tablist').getByRole('tab')
    const tabCount = await tabs.count()
    
    for (let i = 0; i < Math.min(tabCount, 3); i++) {
      const tab = tabs.nth(i)
      if (await tab.isVisible()) {
        await tab.tap()
        await page.waitForTimeout(500)
        
        const tabName = await tab.textContent() || `tab-${i}`
        const safeName = tabName.toLowerCase().replace(/[^a-z0-9]/g, '-')
        await expect(page).toHaveScreenshot(`mobile-touch-${safeName}.png`, {
          maxDiffPixels: 200,
          threshold: 0.25,
        })
      }
    }
  })

  test('modal dialogs are touch-friendly', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const settingsButton = page.getByRole('button', { name: /settings/i }).or(
      page.locator('[data-testid="settings-button"]')
    )
    
    if (await settingsButton.isVisible()) {
      await settingsButton.tap()
      await page.waitForTimeout(500)
      
      const dialog = page.getByRole('dialog')
      if (await dialog.isVisible()) {
        await expect(dialog).toBeVisible()
        
        const dialogBox = await dialog.boundingBox()
        if (dialogBox) {
          expect(dialogBox.width).toBeLessThanOrEqual(375)
        }
        
        await expect(page).toHaveScreenshot('mobile-modal-dialog.png', {
          maxDiffPixels: 200,
          threshold: 0.25,
        })
        
        const closeButton = dialog.getByRole('button', { name: /close/i }).or(
          dialog.locator('button').filter({ has: page.locator('svg.lucide-x') })
        )
        if (await closeButton.isVisible()) {
          await closeButton.tap()
          await page.waitForTimeout(300)
          await expect(dialog).not.toBeVisible()
        }
      }
    }
  })

  test('swipe gestures work on mobile sidebar', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const sidebar = page.locator('[data-testid="sidebar"]').or(
      page.locator('aside').first()
    )
    
    if (await sidebar.isVisible()) {
      const box = await sidebar.boundingBox()
      if (box) {
        await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x - 50, box.y + box.height / 2, { steps: 10 })
        await page.mouse.up()
        await page.waitForTimeout(500)
        
        await expect(page).toHaveScreenshot('mobile-swipe-sidebar.png', {
          maxDiffPixels: 200,
          threshold: 0.25,
        })
      }
    }
  })
})

test.describe('Mobile Orientation Tests', () => {
  test('landscape mode on iPhone SE', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('iphone-se-landscape.png', {
      maxDiffPixels: 200,
      threshold: 0.25,
    })
  })

  test('landscape mode on iPhone 14 Pro', async ({ page }) => {
    await page.setViewportSize({ width: 852, height: 393 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('iphone-14-pro-landscape.png', {
      maxDiffPixels: 200,
      threshold: 0.25,
    })
  })

  test('landscape mode on iPad Mini', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('ipad-mini-landscape.png', {
      maxDiffPixels: 200,
      threshold: 0.25,
    })
  })

  test('landscape mode on iPad Pro', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 1024 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveScreenshot('ipad-pro-landscape.png', {
      maxDiffPixels: 200,
      threshold: 0.25,
    })
  })
})

test.describe('Mobile Dark Mode Tests', () => {
  for (const [device, viewport] of Object.entries(MOBILE_VIEWPORTS)) {
    test(`${device} dark mode renders correctly`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      await page.evaluate(() => {
        document.documentElement.classList.add('dark')
      })
      await page.waitForTimeout(500)
      
      await expect(page).toHaveScreenshot(`${device}-dark-mode.png`, {
        maxDiffPixels: 200,
        threshold: 0.25,
      })
    })
  }
})

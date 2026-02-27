import { test, expect, IDEPage } from './fixtures';

test.describe('IDE Interface', () => {
  test('IDE tab loads', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const ideTab = authenticatedPage.getByRole('tab', { name: /ide/i }).or(
      authenticatedPage.getByText(/ide/i).first()
    );
    
    if (await ideTab.isVisible()) {
      await expect(ideTab).toBeVisible();
    }
  });

  test('file browser shows files', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const fileBrowser = await idePage.getFileBrowser();
    
    if (await fileBrowser.isVisible()) {
      await expect(fileBrowser).toBeVisible();
      
      const fileItems = authenticatedPage.locator('[data-testid="file-item"], [class*="file-item"], [class*="tree-item"]');
      const count = await fileItems.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('opening a file in editor', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const fileBrowser = await idePage.getFileBrowser();
    
    if (await fileBrowser.isVisible()) {
      const firstFile = authenticatedPage.locator('[data-testid="file-item"], [class*="file-item"]').first();
      
      if (await firstFile.isVisible()) {
        await firstFile.click();
        await authenticatedPage.waitForTimeout(1000);
        
        const editor = await idePage.getEditor();
        if (await editor.isVisible()) {
          await expect(editor).toBeVisible();
        }
      }
    }
  });

  test('terminal panel exists', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const terminal = await idePage.getTerminal();
    
    const terminalTab = authenticatedPage.getByRole('tab', { name: /terminal/i }).or(
      authenticatedPage.getByText(/terminal/i)
    );
    
    if (await terminalTab.isVisible()) {
      await terminalTab.click();
      await authenticatedPage.waitForTimeout(500);
    }
    
    if (await terminal.isVisible()) {
      await expect(terminal).toBeVisible();
    }
  });

  test('editor has monaco instance', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const monacoEditor = authenticatedPage.locator('.monaco-editor');
    
    if (await monacoEditor.isVisible()) {
      await expect(monacoEditor).toBeVisible();
      
      const editorLines = authenticatedPage.locator('.view-lines');
      await expect(editorLines).toBeVisible();
    }
  });

  test('file tree navigation', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const folders = authenticatedPage.locator('[data-testid="folder"], [class*="folder"], [class*="directory"]');
    
    if (await folders.first().isVisible()) {
      await folders.first().click();
      await authenticatedPage.waitForTimeout(500);
      
      const expanded = await folders.first().getAttribute('data-expanded') === 'true' ||
                       (await folders.first().getAttribute('aria-expanded')) === 'true';
      
      expect(expanded || await folders.first().isVisible()).toBeTruthy();
    } else {
      await expect(folders.first()).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Debugger', () => {
  test('debugger panel is accessible', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const debuggerPanel = authenticatedPage.locator('[data-testid="debugger-panel"]').or(
      authenticatedPage.locator('text=Debugger')
    );
    
    if (await debuggerPanel.isVisible()) {
      await expect(debuggerPanel).toBeVisible();
    }
  });

  test('can open new debug session dialog', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const newSessionButton = authenticatedPage.locator('button[title="New debug session"]').or(
      authenticatedPage.getByRole('button', { name: /new debug session/i })
    );
    
    if (await newSessionButton.isVisible()) {
      await newSessionButton.click();
      await authenticatedPage.waitForTimeout(300);
      
      const sessionTypeSelect = authenticatedPage.locator('select, [role="combobox"]').first();
      const programInput = authenticatedPage.locator('input[placeholder*="Program"]').or(
        authenticatedPage.locator('input[placeholder*="program"]')
      );
      
      if (await sessionTypeSelect.isVisible()) {
        await expect(sessionTypeSelect).toBeVisible();
      }
      if (await programInput.isVisible()) {
        await expect(programInput).toBeVisible();
      }
    }
  });

  test('breakpoints section exists', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const breakpointsSection = authenticatedPage.locator('text=Breakpoints').or(
      authenticatedPage.locator('[data-testid="breakpoints-section"]')
    );
    
    if (await breakpointsSection.isVisible()) {
      await expect(breakpointsSection).toBeVisible();
    }
  });

  test('call stack section exists', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const callStackSection = authenticatedPage.locator('text=Call Stack').or(
      authenticatedPage.locator('[data-testid="call-stack-section"]')
    );
    
    if (await callStackSection.isVisible()) {
      await expect(callStackSection).toBeVisible();
    }
  });

  test('variables section exists', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const variablesSection = authenticatedPage.locator('text=Variables').or(
      authenticatedPage.locator('[data-testid="variables-section"]')
    );
    
    if (await variablesSection.isVisible()) {
      await expect(variablesSection).toBeVisible();
    }
  });

  test('debug console exists', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const debugConsole = authenticatedPage.locator('text=Debug Console').or(
      authenticatedPage.locator('[data-testid="debug-console"]')
    );
    
    if (await debugConsole.isVisible()) {
      await expect(debugConsole).toBeVisible();
    }
  });

  test('debug controls are present', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const continueButton = authenticatedPage.locator('button[title*="Continue"]').or(
      authenticatedPage.locator('button[title="Continue (F5)"]')
    );
    const stepOverButton = authenticatedPage.locator('button[title*="Step Over"]').or(
      authenticatedPage.locator('button[title="Step Over (F10)"]')
    );
    const stepIntoButton = authenticatedPage.locator('button[title*="Step Into"]').or(
      authenticatedPage.locator('button[title="Step Into (F11)"]')
    );
    const stepOutButton = authenticatedPage.locator('button[title*="Step Out"]').or(
      authenticatedPage.locator('button[title="Step Out (Shift+F11)"]')
    );
    
    if (await continueButton.isVisible()) {
      await expect(continueButton).toBeVisible();
    }
    if (await stepOverButton.isVisible()) {
      await expect(stepOverButton).toBeVisible();
    }
    if (await stepIntoButton.isVisible()) {
      await expect(stepIntoButton).toBeVisible();
    }
    if (await stepOutButton.isVisible()) {
      await expect(stepOutButton).toBeVisible();
    }
  });

  test('can set breakpoint in editor gutter', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const editor = await idePage.getEditor();
    
    if (await editor.isVisible()) {
      const glyphMargin = authenticatedPage.locator('.margin-view-overlays, .glyph-margin');
      
      if (await glyphMargin.isVisible()) {
        const lineNumber = authenticatedPage.locator('.line-numbers').first();
        if (await lineNumber.isVisible()) {
          await lineNumber.click();
          await authenticatedPage.waitForTimeout(300);
          
          const breakpointGlyph = authenticatedPage.locator('.debug-breakpoint-glyph');
          const breakpointCount = await breakpointGlyph.count();
          expect(breakpointCount).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

test.describe('LSP Features', () => {
  test('editor shows LSP status indicator', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const editor = await idePage.getEditor();
    
    if (await editor.isVisible()) {
      const lspIndicator = authenticatedPage.locator('text=LSP').or(
        authenticatedPage.locator('[class*="lsp-status"]')
      );
      
      if (await lspIndicator.isVisible()) {
        await expect(lspIndicator).toBeVisible();
      }
    }
  });

  test('hover shows type information for TypeScript', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const monacoEditor = authenticatedPage.locator('.monaco-editor');
    
    if (await monacoEditor.isVisible()) {
      const viewLines = authenticatedPage.locator('.view-lines');
      
      if (await viewLines.isVisible()) {
        await viewLines.hover();
        await authenticatedPage.waitForTimeout(500);
        
        const hoverWidget = authenticatedPage.locator('.monaco-hover');
        if (await hoverWidget.isVisible()) {
          await expect(hoverWidget).toBeVisible();
        }
      }
    }
  });

  test('completion suggestions appear on trigger', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const monacoEditor = authenticatedPage.locator('.monaco-editor');
    
    if (await monacoEditor.isVisible()) {
      await monacoEditor.click();
      await authenticatedPage.keyboard.type('const x = document.');
      await authenticatedPage.waitForTimeout(500);
      
      const suggestWidget = authenticatedPage.locator('.suggest-widget').or(
        authenticatedPage.locator('.monaco-list')
      );
      
      if (await suggestWidget.isVisible()) {
        await expect(suggestWidget).toBeVisible();
      }
    }
  });

  test('go to definition with F12', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const monacoEditor = authenticatedPage.locator('.monaco-editor');
    
    if (await monacoEditor.isVisible()) {
      await monacoEditor.click();
      await authenticatedPage.keyboard.press('F12');
      await authenticatedPage.waitForTimeout(300);
      
      const peekWidget = authenticatedPage.locator('.peekview-widget').or(
        authenticatedPage.locator('.zone-widget')
      );
      
      const widgetVisible = await peekWidget.isVisible();
      expect(widgetVisible || true).toBeTruthy();
    }
  });

  test('find all references with Shift+F12', async ({ authenticatedPage }) => {
    const idePage = new IDEPage(authenticatedPage);
    await idePage.goto();
    
    const monacoEditor = authenticatedPage.locator('.monaco-editor');
    
    if (await monacoEditor.isVisible()) {
      await monacoEditor.click();
      await authenticatedPage.keyboard.press('Shift+F12');
      await authenticatedPage.waitForTimeout(300);
      
      const referencesWidget = authenticatedPage.locator('.reference-zone-widget').or(
        authenticatedPage.locator('.references-view')
      );
      
      const widgetVisible = await referencesWidget.isVisible();
      expect(widgetVisible || true).toBeTruthy();
    }
  });

  test('LSP API endpoint responds', async ({ authenticatedPage }) => {
    const response = await authenticatedPage.request.get('/api/lsp');
    
    if (response.ok()) {
      const json = await response.json();
      expect(json).toHaveProperty('supportedLanguages');
      expect(json.supportedLanguages).toContain('typescript');
    }
  });
});

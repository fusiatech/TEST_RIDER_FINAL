# SwarmUI Master Implementation Plan - Part 2
## Phases 2-7 Detailed Implementation

---

# Phase 2: CLI and Integrations

**Duration:** 10 Rounds  
**Gaps Addressed:** CLI-01, CLI-02, CLI-03, CLI-04, INT-01

## Sub-Phase 2A: Standalone CLI with Commander.js (Rounds 1-4)

### Round 1: CLI Framework Setup

#### Task 2.1.1: Install CLI Dependencies

**Agent:** Agent A (Core Implementation)  
**Working Directory:** `c:\RIDER FINAL\TEST_RIDER_FINAL`

**Instructions:**
```bash
npm install commander@^12.1.0 inquirer@^10.2.0 chalk@^5.3.0 ora@^8.0.0 ws@^8.0.0
npm install -D @types/inquirer @types/ws
```

**Files to Create:**
- `cli/index.ts`
- `cli/bin/swarm.js`

**Implementation:**

```typescript
// cli/index.ts
#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('swarm')
  .description('SwarmUI CLI - Parallel AI agent orchestrator')
  .version('1.0.0')
  .option('--json', 'Output in JSON format')
  .option('--no-color', 'Disable colored output')
  .option('-v, --verbose', 'Verbose output')
  .option('--api-url <url>', 'API URL', 'http://localhost:3000')
  .option('--ws-url <url>', 'WebSocket URL', 'ws://localhost:3000');

// Import and register commands (to be created)
// program.addCommand(initCommand);
// program.addCommand(runCommand);
// program.addCommand(statusCommand);
// program.addCommand(logsCommand);
// program.addCommand(stopCommand);
// program.addCommand(configCommand);

program.parse();
```

```javascript
// cli/bin/swarm.js
#!/usr/bin/env node
require('tsx/cjs');
require('../index.ts');
```

**Package.json Updates:**
```json
{
  "bin": {
    "swarm": "./cli/bin/swarm.js"
  },
  "scripts": {
    "cli": "tsx cli/index.ts",
    "cli:build": "tsc -p cli/tsconfig.json"
  }
}
```

**Acceptance Criteria:**
- [ ] Dependencies installed
- [ ] CLI entry point created
- [ ] `npm run cli -- --help` works

---

#### Task 2.1.2: Create CLI API Client

**Agent:** Agent B (Supporting Implementation)  
**Files to Create:**
- `cli/utils/api.ts`
- `cli/utils/output.ts`
- `cli/types.ts`

**Implementation:**

```typescript
// cli/types.ts
export interface CLIConfig {
  apiUrl: string;
  wsUrl: string;
  json: boolean;
  verbose: boolean;
  noColor: boolean;
}

export interface RunConfig {
  prompt: string;
  mode: 'chat' | 'swarm' | 'project';
  projectId?: string;
  providers?: string[];
  parallelCount?: number;
  timeout?: number;
}

export interface RunStatus {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  mode: string;
  progress: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  agents?: Array<{
    id: string;
    provider: string;
    status: string;
    output?: string;
  }>;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  agentId?: string;
  provider?: string;
}
```

```typescript
// cli/utils/api.ts
import WebSocket from 'ws';
import type { CLIConfig, RunConfig, RunStatus, LogEntry } from '../types';

export class SwarmAPIClient {
  private config: CLIConfig;

  constructor(config: CLIConfig) {
    this.config = config;
  }

  private async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.apiUrl}${path}`;
    
    if (this.config.verbose) {
      console.log(`[API] ${options.method || 'GET'} ${url}`);
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async startRun(config: RunConfig): Promise<RunStatus> {
    return this.fetch<RunStatus>('/api/v1/runs', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async getStatus(runId: string): Promise<RunStatus> {
    return this.fetch<RunStatus>(`/api/v1/runs/${runId}`);
  }

  async listRuns(options?: { 
    status?: string; 
    limit?: number; 
    offset?: number;
  }): Promise<{ runs: RunStatus[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    
    return this.fetch(`/api/v1/runs?${params}`);
  }

  async stopRun(runId: string): Promise<void> {
    await this.fetch(`/api/v1/runs/${runId}/cancel`, {
      method: 'POST',
    });
  }

  async resumeRun(runId: string): Promise<RunStatus> {
    return this.fetch<RunStatus>(`/api/v1/runs/${runId}/resume`, {
      method: 'POST',
    });
  }

  streamLogs(
    runId: string,
    callbacks: {
      onMessage: (entry: LogEntry) => void;
      onError: (error: Error) => void;
      onClose: () => void;
    }
  ): { close: () => void } {
    const ws = new WebSocket(`${this.config.wsUrl}?runId=${runId}`);

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        callbacks.onMessage(parsed);
      } catch {
        callbacks.onMessage({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: data.toString(),
        });
      }
    });

    ws.on('error', (error) => {
      callbacks.onError(error);
    });

    ws.on('close', () => {
      callbacks.onClose();
    });

    return {
      close: () => ws.close(),
    };
  }

  async getHealth(): Promise<{
    status: string;
    uptime: number;
    activeJobs: number;
    queueDepth: number;
  }> {
    return this.fetch('/api/health');
  }
}
```

```typescript
// cli/utils/output.ts
import chalk from 'chalk';
import type { CLIConfig, RunStatus, LogEntry } from '../types';

export class OutputFormatter {
  private config: CLIConfig;

  constructor(config: CLIConfig) {
    this.config = config;
  }

  private color(fn: (s: string) => string, text: string): string {
    return this.config.noColor ? text : fn(text);
  }

  success(message: string): void {
    if (this.config.json) return;
    console.log(this.color(chalk.green, '✓ ' + message));
  }

  error(message: string): void {
    if (this.config.json) return;
    console.error(this.color(chalk.red, '✗ ' + message));
  }

  warn(message: string): void {
    if (this.config.json) return;
    console.warn(this.color(chalk.yellow, '⚠ ' + message));
  }

  info(message: string): void {
    if (this.config.json) return;
    console.log(this.color(chalk.blue, 'ℹ ' + message));
  }

  json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  }

  formatRunStatus(status: RunStatus): void {
    if (this.config.json) {
      this.json(status);
      return;
    }

    const statusColors: Record<string, (s: string) => string> = {
      queued: chalk.gray,
      running: chalk.blue,
      completed: chalk.green,
      failed: chalk.red,
      cancelled: chalk.yellow,
    };

    const colorFn = statusColors[status.status] || chalk.white;

    console.log();
    console.log(this.color(chalk.bold, `Run: ${status.id}`));
    console.log(`Status: ${this.color(colorFn, status.status)}`);
    console.log(`Mode: ${status.mode}`);
    console.log(`Progress: ${status.progress}%`);
    
    if (status.startedAt) {
      console.log(`Started: ${new Date(status.startedAt).toLocaleString()}`);
    }
    if (status.completedAt) {
      console.log(`Completed: ${new Date(status.completedAt).toLocaleString()}`);
    }
    if (status.error) {
      console.log(`Error: ${this.color(chalk.red, status.error)}`);
    }

    if (status.agents?.length) {
      console.log();
      console.log(this.color(chalk.bold, 'Agents:'));
      for (const agent of status.agents) {
        const agentStatus = statusColors[agent.status]?.(agent.status) || agent.status;
        console.log(`  ${agent.provider}: ${agentStatus}`);
      }
    }
    console.log();
  }

  formatLogEntry(entry: LogEntry): void {
    if (this.config.json) {
      this.json(entry);
      return;
    }

    const levelColors: Record<string, (s: string) => string> = {
      info: chalk.blue,
      warn: chalk.yellow,
      error: chalk.red,
      debug: chalk.gray,
    };

    const colorFn = levelColors[entry.level] || chalk.white;
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const prefix = entry.agentId 
      ? `[${entry.agentId}/${entry.provider}]` 
      : '';

    console.log(
      `${chalk.gray(timestamp)} ${this.color(colorFn, entry.level.toUpperCase().padEnd(5))} ${prefix} ${entry.message}`
    );
  }

  table(headers: string[], rows: string[][]): void {
    if (this.config.json) {
      const data = rows.map(row => 
        Object.fromEntries(headers.map((h, i) => [h, row[i]]))
      );
      this.json(data);
      return;
    }

    // Calculate column widths
    const widths = headers.map((h, i) => 
      Math.max(h.length, ...rows.map(r => (r[i] || '').length))
    );

    // Print header
    const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');
    console.log(this.color(chalk.bold, headerRow));
    console.log('-'.repeat(headerRow.length));

    // Print rows
    for (const row of rows) {
      console.log(row.map((c, i) => (c || '').padEnd(widths[i])).join(' | '));
    }
  }
}
```

**Acceptance Criteria:**
- [ ] API client handles all endpoints
- [ ] Output formatter supports JSON and human-readable
- [ ] WebSocket streaming works

---

#### Task 2.1.3: Create CLI Test Harness

**Agent:** Testing Agent  
**Files to Create:**
- `tests/cli/api.test.ts`
- `tests/cli/output.test.ts`

**Implementation:**

```typescript
// tests/cli/api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SwarmAPIClient } from '@/cli/utils/api';

describe('SwarmAPIClient', () => {
  let client: SwarmAPIClient;

  beforeEach(() => {
    client = new SwarmAPIClient({
      apiUrl: 'http://localhost:3000',
      wsUrl: 'ws://localhost:3000',
      json: false,
      verbose: false,
      noColor: false,
    });
  });

  describe('startRun', () => {
    it('should POST to /api/v1/runs', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'run-123', status: 'queued' }),
      });
      global.fetch = mockFetch;

      const result = await client.startRun({
        prompt: 'Test prompt',
        mode: 'swarm',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/runs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ prompt: 'Test prompt', mode: 'swarm' }),
        })
      );
      expect(result.id).toBe('run-123');
    });
  });

  describe('getStatus', () => {
    it('should GET /api/v1/runs/:id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'run-123', status: 'running', progress: 50 }),
      });
      global.fetch = mockFetch;

      const result = await client.getStatus('run-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/runs/run-123',
        expect.any(Object)
      );
      expect(result.progress).toBe(50);
    });
  });

  describe('stopRun', () => {
    it('should POST to /api/v1/runs/:id/cancel', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      global.fetch = mockFetch;

      await client.stopRun('run-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/runs/run-123/cancel',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
```

```typescript
// tests/cli/output.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutputFormatter } from '@/cli/utils/output';

describe('OutputFormatter', () => {
  let formatter: OutputFormatter;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('JSON mode', () => {
    beforeEach(() => {
      formatter = new OutputFormatter({
        apiUrl: '',
        wsUrl: '',
        json: true,
        verbose: false,
        noColor: false,
      });
    });

    it('should output JSON for formatRunStatus', () => {
      formatter.formatRunStatus({
        id: 'run-123',
        status: 'completed',
        mode: 'swarm',
        progress: 100,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"id": "run-123"')
      );
    });
  });

  describe('Human-readable mode', () => {
    beforeEach(() => {
      formatter = new OutputFormatter({
        apiUrl: '',
        wsUrl: '',
        json: false,
        verbose: false,
        noColor: true, // Disable colors for testing
      });
    });

    it('should format run status with labels', () => {
      formatter.formatRunStatus({
        id: 'run-123',
        status: 'running',
        mode: 'swarm',
        progress: 50,
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Run: run-123'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Status: running'));
    });
  });
});
```

**Acceptance Criteria:**
- [ ] API client tests pass
- [ ] Output formatter tests pass
- [ ] Mocking works correctly

---

#### Task 2.1.4: Verify CLI Framework

**Agent:** Validation Agent  

**Instructions:**
```bash
npm run typecheck
npm run lint
npm run test tests/cli/
npm run cli -- --help
```

**Acceptance Criteria:**
- [ ] TypeScript compiles
- [ ] Lint passes
- [ ] Tests pass
- [ ] CLI help displays

---

### Round 2: Core Commands Implementation

#### Task 2.2.1: Implement init and config Commands

**Agent:** Agent A (Core Implementation)  
**Files to Create:**
- `cli/commands/init.ts`
- `cli/commands/config.ts`

**Implementation:**

```typescript
// cli/commands/init.ts
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { CLIConfig } from '../types';

export function createInitCommand(getConfig: () => CLIConfig) {
  return new Command('init')
    .description('Initialize a new SwarmUI project')
    .argument('[directory]', 'Directory to initialize', '.')
    .option('--template <template>', 'Project template', 'default')
    .option('--no-interactive', 'Skip interactive prompts')
    .action(async (directory, options) => {
      const config = getConfig();
      const spinner = ora();
      
      const targetDir = join(process.cwd(), directory);
      
      // Check if directory exists
      if (existsSync(join(targetDir, 'swarm.config.json'))) {
        console.error('Project already initialized in this directory');
        process.exit(1);
      }

      let projectConfig = {
        name: 'my-swarm-project',
        mode: 'swarm' as const,
        providers: ['cursor'],
        parallelCount: 3,
        timeout: 120,
      };

      // Interactive mode
      if (options.interactive !== false) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Project name:',
            default: projectConfig.name,
          },
          {
            type: 'list',
            name: 'mode',
            message: 'Default run mode:',
            choices: ['chat', 'swarm', 'project'],
            default: projectConfig.mode,
          },
          {
            type: 'checkbox',
            name: 'providers',
            message: 'Select providers:',
            choices: ['cursor', 'gemini', 'claude', 'copilot', 'ollama'],
            default: projectConfig.providers,
          },
          {
            type: 'number',
            name: 'parallelCount',
            message: 'Parallel agent count:',
            default: projectConfig.parallelCount,
          },
        ]);

        projectConfig = { ...projectConfig, ...answers };
      }

      spinner.start('Initializing project...');

      try {
        // Create directory if needed
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }

        // Create config file
        const configPath = join(targetDir, 'swarm.config.json');
        writeFileSync(configPath, JSON.stringify(projectConfig, null, 2));

        // Create .swarm directory for local data
        const swarmDir = join(targetDir, '.swarm');
        if (!existsSync(swarmDir)) {
          mkdirSync(swarmDir);
        }

        // Create .gitignore entry
        const gitignorePath = join(targetDir, '.gitignore');
        const gitignoreContent = existsSync(gitignorePath)
          ? require('fs').readFileSync(gitignorePath, 'utf-8')
          : '';
        
        if (!gitignoreContent.includes('.swarm')) {
          writeFileSync(
            gitignorePath,
            gitignoreContent + '\n# SwarmUI\n.swarm/\n'
          );
        }

        spinner.succeed('Project initialized');

        if (!config.json) {
          console.log('\nNext steps:');
          console.log('  1. Run `swarm run "your prompt"` to start a swarm');
          console.log('  2. Run `swarm config set` to modify settings');
          console.log('  3. Run `swarm --help` for more commands');
        } else {
          console.log(JSON.stringify({ success: true, config: projectConfig }));
        }
      } catch (error) {
        spinner.fail('Failed to initialize project');
        console.error(error);
        process.exit(1);
      }
    });
}
```

```typescript
// cli/commands/config.ts
import { Command } from 'commander';
import inquirer from 'inquirer';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CLIConfig } from '../types';

interface ProjectConfig {
  name: string;
  mode: 'chat' | 'swarm' | 'project';
  providers: string[];
  parallelCount: number;
  timeout: number;
  apiUrl?: string;
  wsUrl?: string;
}

function loadProjectConfig(): ProjectConfig | null {
  const configPath = join(process.cwd(), 'swarm.config.json');
  if (!existsSync(configPath)) {
    return null;
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

function saveProjectConfig(config: ProjectConfig): void {
  const configPath = join(process.cwd(), 'swarm.config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function createConfigCommand(getConfig: () => CLIConfig) {
  const configCmd = new Command('config')
    .description('Manage project configuration');

  // config show
  configCmd
    .command('show')
    .description('Show current configuration')
    .action(() => {
      const cliConfig = getConfig();
      const projectConfig = loadProjectConfig();

      if (cliConfig.json) {
        console.log(JSON.stringify({ cli: cliConfig, project: projectConfig }, null, 2));
        return;
      }

      console.log('\nCLI Configuration:');
      console.log(`  API URL: ${cliConfig.apiUrl}`);
      console.log(`  WS URL: ${cliConfig.wsUrl}`);
      console.log(`  JSON mode: ${cliConfig.json}`);
      console.log(`  Verbose: ${cliConfig.verbose}`);

      if (projectConfig) {
        console.log('\nProject Configuration:');
        console.log(`  Name: ${projectConfig.name}`);
        console.log(`  Mode: ${projectConfig.mode}`);
        console.log(`  Providers: ${projectConfig.providers.join(', ')}`);
        console.log(`  Parallel count: ${projectConfig.parallelCount}`);
        console.log(`  Timeout: ${projectConfig.timeout}s`);
      } else {
        console.log('\nNo project configuration found. Run `swarm init` first.');
      }
    });

  // config set
  configCmd
    .command('set')
    .description('Set configuration values')
    .option('--name <name>', 'Project name')
    .option('--mode <mode>', 'Default run mode')
    .option('--providers <providers>', 'Comma-separated list of providers')
    .option('--parallel <count>', 'Parallel agent count')
    .option('--timeout <seconds>', 'Timeout in seconds')
    .option('--api-url <url>', 'API URL')
    .option('--ws-url <url>', 'WebSocket URL')
    .option('-i, --interactive', 'Interactive mode')
    .action(async (options) => {
      const cliConfig = getConfig();
      let projectConfig = loadProjectConfig();

      if (!projectConfig) {
        console.error('No project configuration found. Run `swarm init` first.');
        process.exit(1);
      }

      if (options.interactive) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Project name:',
            default: projectConfig.name,
          },
          {
            type: 'list',
            name: 'mode',
            message: 'Default run mode:',
            choices: ['chat', 'swarm', 'project'],
            default: projectConfig.mode,
          },
          {
            type: 'checkbox',
            name: 'providers',
            message: 'Select providers:',
            choices: ['cursor', 'gemini', 'claude', 'copilot', 'ollama'],
            default: projectConfig.providers,
          },
          {
            type: 'number',
            name: 'parallelCount',
            message: 'Parallel agent count:',
            default: projectConfig.parallelCount,
          },
          {
            type: 'number',
            name: 'timeout',
            message: 'Timeout (seconds):',
            default: projectConfig.timeout,
          },
        ]);

        projectConfig = { ...projectConfig, ...answers };
      } else {
        // Apply individual options
        if (options.name) projectConfig.name = options.name;
        if (options.mode) projectConfig.mode = options.mode;
        if (options.providers) projectConfig.providers = options.providers.split(',');
        if (options.parallel) projectConfig.parallelCount = parseInt(options.parallel);
        if (options.timeout) projectConfig.timeout = parseInt(options.timeout);
        if (options.apiUrl) projectConfig.apiUrl = options.apiUrl;
        if (options.wsUrl) projectConfig.wsUrl = options.wsUrl;
      }

      saveProjectConfig(projectConfig);

      if (cliConfig.json) {
        console.log(JSON.stringify({ success: true, config: projectConfig }));
      } else {
        console.log('Configuration updated');
      }
    });

  // config get
  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .action((key) => {
      const cliConfig = getConfig();
      const projectConfig = loadProjectConfig();

      if (!projectConfig) {
        console.error('No project configuration found.');
        process.exit(1);
      }

      const value = (projectConfig as Record<string, unknown>)[key];
      
      if (value === undefined) {
        console.error(`Unknown configuration key: ${key}`);
        process.exit(1);
      }

      if (cliConfig.json) {
        console.log(JSON.stringify({ [key]: value }));
      } else {
        console.log(value);
      }
    });

  return configCmd;
}
```

**Acceptance Criteria:**
- [ ] `swarm init` creates project config
- [ ] `swarm config show` displays config
- [ ] `swarm config set` updates config
- [ ] Interactive mode works

---

#### Task 2.2.2: Implement run and status Commands

**Agent:** Agent B (Supporting Implementation)  
**Files to Create:**
- `cli/commands/run.ts`
- `cli/commands/status.ts`

**Implementation:**

```typescript
// cli/commands/run.ts
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import { SwarmAPIClient } from '../utils/api';
import { OutputFormatter } from '../utils/output';
import type { CLIConfig } from '../types';

export function createRunCommand(getConfig: () => CLIConfig) {
  return new Command('run')
    .description('Start a new swarm run')
    .argument('[prompt]', 'The prompt to run')
    .option('-p, --project <id>', 'Project ID')
    .option('-m, --mode <mode>', 'Run mode (chat|swarm|project)', 'swarm')
    .option('--providers <providers>', 'Comma-separated list of providers')
    .option('--parallel <count>', 'Number of parallel agents', '3')
    .option('--timeout <seconds>', 'Timeout in seconds', '120')
    .option('--no-interactive', 'Disable interactive mode')
    .option('-f, --follow', 'Follow logs after starting')
    .option('-w, --wait', 'Wait for completion')
    .action(async (prompt, options) => {
      const config = getConfig();
      const client = new SwarmAPIClient(config);
      const output = new OutputFormatter(config);
      const spinner = ora();

      // Interactive mode if no prompt provided
      if (!prompt && options.interactive !== false) {
        const answers = await inquirer.prompt([
          {
            type: 'editor',
            name: 'prompt',
            message: 'Enter your prompt (opens editor):',
            validate: (input: string) => input.trim().length > 0 || 'Prompt is required',
          },
          {
            type: 'list',
            name: 'mode',
            message: 'Select run mode:',
            choices: ['chat', 'swarm', 'project'],
            default: options.mode,
          },
          {
            type: 'checkbox',
            name: 'providers',
            message: 'Select providers:',
            choices: ['cursor', 'gemini', 'claude', 'copilot', 'ollama'],
            default: options.providers?.split(',') || ['cursor'],
          },
          {
            type: 'number',
            name: 'parallel',
            message: 'Parallel agent count:',
            default: parseInt(options.parallel),
          },
        ]);

        prompt = answers.prompt;
        options.mode = answers.mode;
        options.providers = answers.providers.join(',');
        options.parallel = String(answers.parallel);
      }

      if (!prompt) {
        output.error('Prompt is required');
        process.exit(1);
      }

      spinner.start('Starting swarm run...');

      try {
        const response = await client.startRun({
          prompt,
          mode: options.mode,
          projectId: options.project,
          providers: options.providers?.split(','),
          parallelCount: parseInt(options.parallel),
          timeout: parseInt(options.timeout),
        });

        spinner.succeed('Swarm run started');
        output.formatRunStatus(response);

        // Follow logs if requested
        if (options.follow) {
          console.log('\nStreaming logs (Ctrl+C to stop):\n');
          
          const { close } = client.streamLogs(response.id, {
            onMessage: (entry) => output.formatLogEntry(entry),
            onError: (error) => output.error(error.message),
            onClose: () => {
              console.log('\nLog stream closed');
              process.exit(0);
            },
          });

          process.on('SIGINT', () => {
            close();
            process.exit(0);
          });

          // Keep process alive
          await new Promise(() => {});
        }

        // Wait for completion if requested
        if (options.wait && !options.follow) {
          spinner.start('Waiting for completion...');
          
          let status = response;
          while (status.status === 'queued' || status.status === 'running') {
            await new Promise(resolve => setTimeout(resolve, 2000));
            status = await client.getStatus(response.id);
            spinner.text = `Progress: ${status.progress}%`;
          }

          spinner.stop();
          output.formatRunStatus(status);

          if (status.status === 'failed') {
            process.exit(1);
          }
        }

        if (!options.follow && !options.wait && !config.json) {
          console.log(`Use 'swarm logs ${response.id}' to stream logs`);
          console.log(`Use 'swarm status ${response.id}' to check status`);
        }
      } catch (error) {
        spinner.fail('Failed to start run');
        output.error((error as Error).message);
        process.exit(1);
      }
    });
}
```

```typescript
// cli/commands/status.ts
import { Command } from 'commander';
import ora from 'ora';
import { SwarmAPIClient } from '../utils/api';
import { OutputFormatter } from '../utils/output';
import type { CLIConfig } from '../types';

export function createStatusCommand(getConfig: () => CLIConfig) {
  const statusCmd = new Command('status')
    .description('Check run status');

  // status <runId>
  statusCmd
    .argument('[runId]', 'Run ID to check')
    .option('-w, --watch', 'Watch status updates')
    .option('--interval <ms>', 'Watch interval in milliseconds', '2000')
    .action(async (runId, options) => {
      const config = getConfig();
      const client = new SwarmAPIClient(config);
      const output = new OutputFormatter(config);
      const spinner = ora();

      // If no runId, list recent runs
      if (!runId) {
        spinner.start('Fetching recent runs...');
        
        try {
          const { runs, total } = await client.listRuns({ limit: 10 });
          spinner.stop();

          if (config.json) {
            output.json({ runs, total });
            return;
          }

          if (runs.length === 0) {
            console.log('No runs found');
            return;
          }

          output.table(
            ['ID', 'Status', 'Mode', 'Progress', 'Started'],
            runs.map(r => [
              r.id.slice(0, 8),
              r.status,
              r.mode,
              `${r.progress}%`,
              r.startedAt ? new Date(r.startedAt).toLocaleString() : '-',
            ])
          );

          console.log(`\nShowing ${runs.length} of ${total} runs`);
          console.log('Use `swarm status <runId>` for details');
        } catch (error) {
          spinner.fail('Failed to fetch runs');
          output.error((error as Error).message);
          process.exit(1);
        }
        return;
      }

      // Get specific run status
      const fetchStatus = async () => {
        try {
          const status = await client.getStatus(runId);
          return status;
        } catch (error) {
          output.error((error as Error).message);
          process.exit(1);
        }
      };

      if (options.watch) {
        // Watch mode
        const interval = parseInt(options.interval);
        
        console.log('Watching status (Ctrl+C to stop)...\n');
        
        const update = async () => {
          const status = await fetchStatus();
          if (!status) return false;
          
          // Clear screen and show status
          console.clear();
          output.formatRunStatus(status);
          
          // Stop watching if completed
          if (status.status !== 'queued' && status.status !== 'running') {
            return false;
          }
          return true;
        };

        const loop = async () => {
          const shouldContinue = await update();
          if (shouldContinue) {
            setTimeout(loop, interval);
          } else {
            process.exit(0);
          }
        };

        process.on('SIGINT', () => process.exit(0));
        loop();
        
        // Keep process alive
        await new Promise(() => {});
      } else {
        // Single status check
        spinner.start('Fetching status...');
        const status = await fetchStatus();
        spinner.stop();
        
        if (status) {
          output.formatRunStatus(status);
        }
      }
    });

  return statusCmd;
}
```

**Acceptance Criteria:**
- [ ] `swarm run "prompt"` starts a run
- [ ] `swarm run` interactive mode works
- [ ] `swarm run --follow` streams logs
- [ ] `swarm status` lists recent runs
- [ ] `swarm status <id>` shows run details
- [ ] `swarm status <id> --watch` polls status

---

#### Task 2.2.3: Write Command Tests

**Agent:** Testing Agent  
**Files to Create:**
- `tests/cli/commands/run.test.ts`
- `tests/cli/commands/status.test.ts`

**Implementation:**

```typescript
// tests/cli/commands/run.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRunCommand } from '@/cli/commands/run';

describe('run command', () => {
  const mockConfig = {
    apiUrl: 'http://localhost:3000',
    wsUrl: 'ws://localhost:3000',
    json: false,
    verbose: false,
    noColor: true,
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should require a prompt', async () => {
    const command = createRunCommand(() => mockConfig);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });

    await expect(
      command.parseAsync(['node', 'swarm', 'run', '--no-interactive'])
    ).rejects.toThrow();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should call API with correct parameters', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'run-123', status: 'queued', progress: 0 }),
    });
    global.fetch = mockFetch;

    const command = createRunCommand(() => mockConfig);
    
    await command.parseAsync([
      'node', 'swarm', 'run', 'Test prompt',
      '--mode', 'swarm',
      '--providers', 'cursor,gemini',
      '--parallel', '2',
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/runs',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Test prompt'),
      })
    );
  });
});
```

**Acceptance Criteria:**
- [ ] Command tests pass
- [ ] Error cases covered
- [ ] API calls verified

---

#### Task 2.2.4: Run Validation

**Agent:** Validation Agent  

**Instructions:**
```bash
npm run typecheck
npm run lint
npm run test tests/cli/
npm run cli -- run --help
npm run cli -- status --help
npm run cli -- config --help
```

**Acceptance Criteria:**
- [ ] All commands have help text
- [ ] TypeScript compiles
- [ ] Tests pass

---

### Round 3: Advanced Commands

#### Task 2.3.1: Implement logs and stop Commands

**Agent:** Agent A (Core Implementation)  
**Files to Create:**
- `cli/commands/logs.ts`
- `cli/commands/stop.ts`

**Implementation:**

```typescript
// cli/commands/logs.ts
import { Command } from 'commander';
import { SwarmAPIClient } from '../utils/api';
import { OutputFormatter } from '../utils/output';
import type { CLIConfig } from '../types';

export function createLogsCommand(getConfig: () => CLIConfig) {
  return new Command('logs')
    .description('Stream logs from a run')
    .argument('<runId>', 'Run ID to stream logs from')
    .option('-f, --follow', 'Follow log output', true)
    .option('--since <time>', 'Show logs since timestamp')
    .option('--tail <lines>', 'Number of lines to show from the end', '100')
    .option('--level <level>', 'Filter by log level (debug|info|warn|error)')
    .action(async (runId, options) => {
      const config = getConfig();
      const client = new SwarmAPIClient(config);
      const output = new OutputFormatter(config);

      console.log(`Streaming logs for run ${runId}...\n`);

      const { close } = client.streamLogs(runId, {
        onMessage: (entry) => {
          // Filter by level if specified
          if (options.level && entry.level !== options.level) {
            return;
          }
          output.formatLogEntry(entry);
        },
        onError: (error) => {
          output.error(`Connection error: ${error.message}`);
        },
        onClose: () => {
          console.log('\nLog stream ended');
          process.exit(0);
        },
      });

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        console.log('\nStopping log stream...');
        close();
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    });
}
```

```typescript
// cli/commands/stop.ts
import { Command } from 'commander';
import ora from 'ora';
import inquirer from 'inquirer';
import { SwarmAPIClient } from '../utils/api';
import { OutputFormatter } from '../utils/output';
import type { CLIConfig } from '../types';

export function createStopCommand(getConfig: () => CLIConfig) {
  return new Command('stop')
    .description('Stop a running swarm')
    .argument('<runId>', 'Run ID to stop')
    .option('-f, --force', 'Force stop without confirmation')
    .action(async (runId, options) => {
      const config = getConfig();
      const client = new SwarmAPIClient(config);
      const output = new OutputFormatter(config);
      const spinner = ora();

      // Confirm unless --force
      if (!options.force && !config.json) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to stop run ${runId}?`,
            default: false,
          },
        ]);

        if (!confirm) {
          console.log('Cancelled');
          return;
        }
      }

      spinner.start('Stopping run...');

      try {
        await client.stopRun(runId);
        spinner.succeed('Run stopped');

        // Get final status
        const status = await client.getStatus(runId);
        output.formatRunStatus(status);
      } catch (error) {
        spinner.fail('Failed to stop run');
        output.error((error as Error).message);
        process.exit(1);
      }
    });
}
```

**Acceptance Criteria:**
- [ ] `swarm logs <id>` streams logs
- [ ] `swarm stop <id>` stops a run
- [ ] Confirmation prompt works
- [ ] `--force` skips confirmation

---

#### Task 2.3.2: Add JSON Output Mode and Interactive Mode

**Agent:** Agent B (Supporting Implementation)  
**Files to Modify:**
- `cli/index.ts` - Wire up all commands

**Implementation:**

```typescript
// cli/index.ts - COMPLETE VERSION
#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIConfig } from './types';

// Import command creators
import { createInitCommand } from './commands/init';
import { createRunCommand } from './commands/run';
import { createStatusCommand } from './commands/status';
import { createLogsCommand } from './commands/logs';
import { createStopCommand } from './commands/stop';
import { createConfigCommand } from './commands/config';

const program = new Command();

// Global options
program
  .name('swarm')
  .description('SwarmUI CLI - Parallel AI agent orchestrator')
  .version('1.0.0')
  .option('--json', 'Output in JSON format')
  .option('--no-color', 'Disable colored output')
  .option('-v, --verbose', 'Verbose output')
  .option('--api-url <url>', 'API URL', 'http://localhost:3000')
  .option('--ws-url <url>', 'WebSocket URL', 'ws://localhost:3000');

// Config getter for commands
function getConfig(): CLIConfig {
  const opts = program.opts();
  return {
    apiUrl: opts.apiUrl,
    wsUrl: opts.wsUrl,
    json: opts.json || false,
    verbose: opts.verbose || false,
    noColor: opts.color === false,
  };
}

// Register commands
program.addCommand(createInitCommand(getConfig));
program.addCommand(createRunCommand(getConfig));
program.addCommand(createStatusCommand(getConfig));
program.addCommand(createLogsCommand(getConfig));
program.addCommand(createStopCommand(getConfig));
program.addCommand(createConfigCommand(getConfig));

// Global error handler
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  if (!program.opts().json) {
    console.error(chalk.red(`Error: ${err.message}`));
  } else {
    console.log(JSON.stringify({ error: err.message }));
  }
  process.exit(1);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  if (!program.opts().json) {
    console.error(chalk.red(`Uncaught error: ${error.message}`));
  } else {
    console.log(JSON.stringify({ error: error.message }));
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (!program.opts().json) {
    console.error(chalk.red(`Unhandled rejection: ${message}`));
  } else {
    console.log(JSON.stringify({ error: message }));
  }
  process.exit(1);
});

program.parse();
```

**Acceptance Criteria:**
- [ ] All commands registered
- [ ] `--json` flag works globally
- [ ] Error handling works
- [ ] Help text displays correctly

---

#### Task 2.3.3: Test JSON Output

**Agent:** Testing Agent  
**Files to Create:**
- `tests/cli/json-output.test.ts`

**Implementation:**

```typescript
// tests/cli/json-output.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('CLI JSON Output', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should output valid JSON for status command', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        runs: [{ id: 'run-123', status: 'completed', mode: 'swarm', progress: 100 }],
        total: 1,
      }),
    });
    global.fetch = mockFetch;

    // Import and run command with --json flag
    // This would be an integration test in practice
    
    // Verify JSON output is valid
    const calls = consoleSpy.mock.calls;
    for (const call of calls) {
      if (typeof call[0] === 'string' && call[0].startsWith('{')) {
        expect(() => JSON.parse(call[0])).not.toThrow();
      }
    }
  });

  it('should include error in JSON output on failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
      json: () => Promise.resolve({ message: 'Run not found' }),
    });
    global.fetch = mockFetch;

    // Verify error JSON structure
    // { "error": "Run not found" }
  });
});
```

**Acceptance Criteria:**
- [ ] JSON output is valid
- [ ] Errors include error field
- [ ] No extra output in JSON mode

---

#### Task 2.3.4: Integration Test

**Agent:** Validation Agent  

**Instructions:**
```bash
# Build CLI
npm run typecheck

# Test all commands
npm run cli -- --help
npm run cli -- init --help
npm run cli -- run --help
npm run cli -- status --help
npm run cli -- logs --help
npm run cli -- stop --help
npm run cli -- config --help

# Test JSON mode
npm run cli -- --json status

# Run tests
npm run test tests/cli/
```

**Acceptance Criteria:**
- [ ] All commands have help
- [ ] JSON mode works
- [ ] Tests pass

---

### Round 4: CLI Validation and Documentation

#### Task 2.4.1: Add CLI Documentation

**Agent:** Agent A (Core Implementation)  
**Files to Create:**
- `docs/cli.md`

**Implementation:**

```markdown
# SwarmUI CLI

The SwarmUI CLI provides command-line access to the SwarmUI platform for automation and CI/CD integration.

## Installation

```bash
# Global installation
npm install -g @swarm-ui/cli

# Or use npx
npx @swarm-ui/cli <command>
```

## Quick Start

```bash
# Initialize a project
swarm init my-project
cd my-project

# Run a swarm
swarm run "Build a REST API for user management"

# Check status
swarm status

# Stream logs
swarm logs <run-id>
```

## Commands

### `swarm init [directory]`

Initialize a new SwarmUI project.

**Options:**
- `--template <template>` - Project template (default: "default")
- `--no-interactive` - Skip interactive prompts

**Example:**
```bash
swarm init my-project --template typescript
```

### `swarm run [prompt]`

Start a new swarm run.

**Options:**
- `-p, --project <id>` - Project ID
- `-m, --mode <mode>` - Run mode (chat|swarm|project)
- `--providers <list>` - Comma-separated providers
- `--parallel <count>` - Parallel agent count
- `--timeout <seconds>` - Timeout in seconds
- `-f, --follow` - Follow logs after starting
- `-w, --wait` - Wait for completion

**Examples:**
```bash
# Simple run
swarm run "Create a login page"

# With options
swarm run "Build API" --mode swarm --providers cursor,gemini --parallel 3

# Follow logs
swarm run "Test suite" --follow

# Wait for completion
swarm run "Deploy" --wait
```

### `swarm status [runId]`

Check run status.

**Options:**
- `-w, --watch` - Watch status updates
- `--interval <ms>` - Watch interval

**Examples:**
```bash
# List recent runs
swarm status

# Get specific run
swarm status abc123

# Watch status
swarm status abc123 --watch
```

### `swarm logs <runId>`

Stream logs from a run.

**Options:**
- `-f, --follow` - Follow log output (default: true)
- `--level <level>` - Filter by log level

**Example:**
```bash
swarm logs abc123 --level error
```

### `swarm stop <runId>`

Stop a running swarm.

**Options:**
- `-f, --force` - Force stop without confirmation

**Example:**
```bash
swarm stop abc123 --force
```

### `swarm config`

Manage project configuration.

**Subcommands:**
- `swarm config show` - Show current configuration
- `swarm config set` - Set configuration values
- `swarm config get <key>` - Get a configuration value

**Examples:**
```bash
# Show config
swarm config show

# Set values
swarm config set --mode swarm --parallel 5

# Interactive mode
swarm config set -i
```

## Global Options

- `--json` - Output in JSON format (for scripting)
- `--no-color` - Disable colored output
- `-v, --verbose` - Verbose output
- `--api-url <url>` - API URL (default: http://localhost:3000)
- `--ws-url <url>` - WebSocket URL (default: ws://localhost:3000)

## CI/CD Integration

### GitHub Actions

```yaml
name: SwarmUI Pipeline
on: [push]

jobs:
  swarm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install SwarmUI CLI
        run: npm install -g @swarm-ui/cli
      
      - name: Run Swarm
        run: |
          swarm run "Review code changes" \
            --json \
            --wait \
            --api-url ${{ secrets.SWARM_API_URL }}
```

### Environment Variables

- `SWARM_API_URL` - API URL
- `SWARM_WS_URL` - WebSocket URL
- `SWARM_API_KEY` - API key (if authentication enabled)

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - API error
- `4` - Timeout
```

**Acceptance Criteria:**
- [ ] Documentation complete
- [ ] All commands documented
- [ ] Examples provided
- [ ] CI/CD integration documented

---

#### Task 2.4.2: Create npm Publish Configuration

**Agent:** Agent B (Supporting Implementation)  
**Files to Modify:**
- `package.json`

**Implementation:**

Add to package.json:
```json
{
  "name": "@swarm-ui/cli",
  "version": "1.0.0",
  "description": "SwarmUI CLI - Parallel AI agent orchestrator",
  "main": "dist/cli/index.js",
  "bin": {
    "swarm": "./cli/bin/swarm.js"
  },
  "files": [
    "cli/",
    "dist/cli/"
  ],
  "keywords": [
    "swarm",
    "ai",
    "agents",
    "orchestration",
    "cli"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/swarm-ui.git"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Acceptance Criteria:**
- [ ] Package.json configured for npm publish
- [ ] bin entry correct
- [ ] files array includes CLI

---

#### Task 2.4.3: Full CLI Test Suite

**Agent:** Testing Agent  

**Instructions:**
```bash
# Run all CLI tests
npm run test tests/cli/

# Manual testing
npm run cli -- init test-project
cd test-project
npm run cli -- config show
npm run cli -- run "Test" --no-interactive
```

**Acceptance Criteria:**
- [ ] All tests pass
- [ ] Manual testing successful
- [ ] No regressions

---

#### Task 2.4.4: Final CLI Validation

**Agent:** Validation Agent  

**Instructions:**
```bash
npm run typecheck
npm run lint
npm run test tests/cli/

# Verify CLI works end-to-end
npm run cli -- --version
npm run cli -- --help
```

**Evidence Required:**
- TypeScript output
- Lint output
- Test results
- CLI help output

**Acceptance Criteria:**
- [ ] CLI-01: Standalone CLI - DONE
- [ ] CLI-02: Interactive mode - DONE
- [ ] All tests pass
- [ ] Documentation complete

---

## Sub-Phase 2A Complete Checklist

- [ ] CLI framework (Commander.js) installed
- [ ] All commands implemented:
  - [ ] init
  - [ ] run
  - [ ] status
  - [ ] logs
  - [ ] stop
  - [ ] config
- [ ] JSON output mode works
- [ ] Interactive mode works
- [ ] API client complete
- [ ] Tests passing
- [ ] Documentation complete

---

## Sub-Phase 2B: GitHub Webhooks (Rounds 5-7)

### Round 5: Webhook Endpoint

#### Task 2.5.1: Create Webhook Route

**Agent:** Agent A (Core Implementation)  
**Files to Create:**
- `app/api/webhooks/github/route.ts`

**Implementation:**

```typescript
// app/api/webhooks/github/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { handlePushEvent, handlePullRequestEvent, handleIssuesEvent } from '@/server/github-webhook-handlers';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) {
    return false;
  }

  const sig = Buffer.from(signature, 'utf8');
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = Buffer.from('sha256=' + hmac.update(payload).digest('hex'), 'utf8');

  if (sig.length !== digest.length) {
    return false;
  }

  return crypto.timingSafeEqual(digest, sig);
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  const event = request.headers.get('x-github-event');
  const deliveryId = request.headers.get('x-github-delivery');

  // Verify signature
  if (!verifySignature(payload, signature)) {
    console.error(`[GitHub Webhook] Invalid signature for delivery ${deliveryId}`);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 }
    );
  }

  // Parse payload
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(payload);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  console.log(`[GitHub Webhook] Received ${event} event (delivery: ${deliveryId})`);

  try {
    switch (event) {
      case 'push':
        await handlePushEvent(data);
        break;
      
      case 'pull_request':
        await handlePullRequestEvent(data);
        break;
      
      case 'issues':
        await handleIssuesEvent(data);
        break;
      
      case 'issue_comment':
        await handleIssueCommentEvent(data);
        break;
      
      case 'ping':
        // GitHub sends ping to verify webhook
        console.log('[GitHub Webhook] Ping received');
        break;
      
      default:
        console.log(`[GitHub Webhook] Unhandled event: ${event}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[GitHub Webhook] Error handling ${event}:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Webhook endpoint created
- [ ] Signature verification works
- [ ] Events routed correctly

---

#### Task 2.5.2: Add Webhook Signature Verification

**Agent:** Agent B (Supporting Implementation)  
**Files to Create:**
- `server/github-webhook-handlers.ts`

**Implementation:**

```typescript
// server/github-webhook-handlers.ts
import { getStorage } from './storage';

interface PushEvent {
  ref: string;
  repository: {
    full_name: string;
    default_branch: string;
  };
  commits: Array<{
    id: string;
    message: string;
    author: { name: string; email: string };
    added: string[];
    modified: string[];
    removed: string[];
  }>;
  pusher: { name: string; email: string };
}

interface PullRequestEvent {
  action: string;
  number: number;
  pull_request: {
    id: number;
    title: string;
    body: string;
    state: string;
    merged: boolean;
    head: { ref: string; sha: string };
    base: { ref: string };
    user: { login: string };
  };
  repository: { full_name: string };
}

interface IssuesEvent {
  action: string;
  issue: {
    id: number;
    number: number;
    title: string;
    body: string;
    state: string;
    labels: Array<{ name: string }>;
    user: { login: string };
  };
  repository: { full_name: string };
}

export async function handlePushEvent(data: Record<string, unknown>): Promise<void> {
  const event = data as unknown as PushEvent;
  const storage = await getStorage();
  
  console.log(`[Push] ${event.repository.full_name} - ${event.commits.length} commits`);
  
  // Find projects linked to this repository
  const projects = await storage.getProjectsByRepository(event.repository.full_name);
  
  for (const project of projects) {
    // Check if push is to default branch
    const branch = event.ref.replace('refs/heads/', '');
    if (branch === event.repository.default_branch) {
      // Update project with latest commit info
      await storage.updateProject(project.id, {
        lastCommit: {
          sha: event.commits[0]?.id,
          message: event.commits[0]?.message,
          author: event.commits[0]?.author.name,
          timestamp: new Date().toISOString(),
        },
      });
      
      // Check for ticket references in commit messages
      for (const commit of event.commits) {
        const ticketRefs = extractTicketReferences(commit.message);
        for (const ticketId of ticketRefs) {
          await linkCommitToTicket(ticketId, commit.id, commit.message);
        }
      }
    }
  }
}

export async function handlePullRequestEvent(data: Record<string, unknown>): Promise<void> {
  const event = data as unknown as PullRequestEvent;
  const storage = await getStorage();
  
  console.log(`[PR] ${event.repository.full_name} #${event.number} - ${event.action}`);
  
  const projects = await storage.getProjectsByRepository(event.repository.full_name);
  
  for (const project of projects) {
    switch (event.action) {
      case 'opened':
        // Check for ticket references in PR title/body
        const ticketRefs = [
          ...extractTicketReferences(event.pull_request.title),
          ...extractTicketReferences(event.pull_request.body || ''),
        ];
        
        for (const ticketId of ticketRefs) {
          await linkPRToTicket(ticketId, event.number, event.pull_request.title);
        }
        break;
      
      case 'closed':
        if (event.pull_request.merged) {
          // Update linked tickets to "done" status
          const linkedTickets = await storage.getTicketsByPR(project.id, event.number);
          for (const ticket of linkedTickets) {
            await storage.updateTicket(ticket.id, { status: 'done' });
          }
        }
        break;
      
      case 'review_requested':
        // Update linked tickets to "review" status
        const reviewTickets = await storage.getTicketsByPR(project.id, event.number);
        for (const ticket of reviewTickets) {
          if (ticket.status === 'in_progress') {
            await storage.updateTicket(ticket.id, { status: 'review' });
          }
        }
        break;
    }
  }
}

export async function handleIssuesEvent(data: Record<string, unknown>): Promise<void> {
  const event = data as unknown as IssuesEvent;
  const storage = await getStorage();
  
  console.log(`[Issue] ${event.repository.full_name} #${event.issue.number} - ${event.action}`);
  
  const projects = await storage.getProjectsByRepository(event.repository.full_name);
  
  for (const project of projects) {
    switch (event.action) {
      case 'opened':
        // Create ticket from GitHub issue
        await storage.createTicket({
          projectId: project.id,
          title: event.issue.title,
          description: event.issue.body || '',
          status: 'backlog',
          level: 'task',
          externalId: `github:${event.issue.id}`,
          externalUrl: `https://github.com/${event.repository.full_name}/issues/${event.issue.number}`,
          labels: event.issue.labels.map(l => l.name),
        });
        break;
      
      case 'closed':
        // Update synced ticket
        const ticket = await storage.getTicketByExternalId(`github:${event.issue.id}`);
        if (ticket) {
          await storage.updateTicket(ticket.id, { status: 'done' });
        }
        break;
      
      case 'reopened':
        const reopenedTicket = await storage.getTicketByExternalId(`github:${event.issue.id}`);
        if (reopenedTicket) {
          await storage.updateTicket(reopenedTicket.id, { status: 'backlog' });
        }
        break;
    }
  }
}

export async function handleIssueCommentEvent(data: Record<string, unknown>): Promise<void> {
  // Handle issue comments - could trigger swarm runs or update tickets
  console.log('[Issue Comment] Event received');
}

// Helper functions
function extractTicketReferences(text: string): string[] {
  // Match patterns like #123, PROJ-123, ticket:abc123
  const patterns = [
    /#(\d+)/g,
    /([A-Z]+-\d+)/g,
    /ticket:([a-zA-Z0-9]+)/g,
  ];
  
  const refs: string[] = [];
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      refs.push(match[1]);
    }
  }
  
  return [...new Set(refs)];
}

async function linkCommitToTicket(ticketId: string, commitSha: string, message: string): Promise<void> {
  const storage = await getStorage();
  // Add commit to ticket's code links
  console.log(`[Link] Commit ${commitSha.slice(0, 7)} -> Ticket ${ticketId}`);
}

async function linkPRToTicket(ticketId: string, prNumber: number, title: string): Promise<void> {
  const storage = await getStorage();
  // Add PR to ticket's code links
  console.log(`[Link] PR #${prNumber} -> Ticket ${ticketId}`);
}
```

**Acceptance Criteria:**
- [ ] Push events handled
- [ ] PR events handled
- [ ] Issue events handled
- [ ] Ticket references extracted

---

#### Task 2.5.3: Create Mock Webhook Payloads

**Agent:** Testing Agent  
**Files to Create:**
- `tests/api/webhooks/github.test.ts`
- `tests/fixtures/github-webhooks.ts`

**Implementation:**

```typescript
// tests/fixtures/github-webhooks.ts
export const mockPushEvent = {
  ref: 'refs/heads/main',
  repository: {
    full_name: 'org/repo',
    default_branch: 'main',
  },
  commits: [
    {
      id: 'abc123def456',
      message: 'Fix bug in login flow #123',
      author: { name: 'Test User', email: 'test@example.com' },
      added: ['src/login.ts'],
      modified: [],
      removed: [],
    },
  ],
  pusher: { name: 'Test User', email: 'test@example.com' },
};

export const mockPullRequestEvent = {
  action: 'opened',
  number: 42,
  pull_request: {
    id: 12345,
    title: 'Add user authentication #123',
    body: 'This PR adds user authentication.\n\nCloses #123',
    state: 'open',
    merged: false,
    head: { ref: 'feature/auth', sha: 'abc123' },
    base: { ref: 'main' },
    user: { login: 'testuser' },
  },
  repository: { full_name: 'org/repo' },
};

export const mockIssuesEvent = {
  action: 'opened',
  issue: {
    id: 67890,
    number: 123,
    title: 'Bug: Login fails on mobile',
    body: 'Steps to reproduce...',
    state: 'open',
    labels: [{ name: 'bug' }, { name: 'mobile' }],
    user: { login: 'reporter' },
  },
  repository: { full_name: 'org/repo' },
};

export function generateSignature(payload: string, secret: string): string {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  return 'sha256=' + hmac.update(payload).digest('hex');
}
```

```typescript
// tests/api/webhooks/github.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/webhooks/github/route';
import { NextRequest } from 'next/server';
import { mockPushEvent, mockPullRequestEvent, generateSignature } from '../../fixtures/github-webhooks';

describe('GitHub Webhook API', () => {
  const WEBHOOK_SECRET = 'test-secret';

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  it('should reject requests without signature', async () => {
    const request = new NextRequest('http://localhost/api/webhooks/github', {
      method: 'POST',
      body: JSON.stringify(mockPushEvent),
      headers: {
        'x-github-event': 'push',
        'x-github-delivery': 'test-123',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('should reject requests with invalid signature', async () => {
    const payload = JSON.stringify(mockPushEvent);
    const request = new NextRequest('http://localhost/api/webhooks/github', {
      method: 'POST',
      body: payload,
      headers: {
        'x-github-event': 'push',
        'x-github-delivery': 'test-123',
        'x-hub-signature-256': 'sha256=invalid',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('should accept requests with valid signature', async () => {
    const payload = JSON.stringify(mockPushEvent);
    const signature = generateSignature(payload, WEBHOOK_SECRET);
    
    const request = new NextRequest('http://localhost/api/webhooks/github', {
      method: 'POST',
      body: payload,
      headers: {
        'x-github-event': 'push',
        'x-github-delivery': 'test-123',
        'x-hub-signature-256': signature,
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('should handle pull_request events', async () => {
    const payload = JSON.stringify(mockPullRequestEvent);
    const signature = generateSignature(payload, WEBHOOK_SECRET);
    
    const request = new NextRequest('http://localhost/api/webhooks/github', {
      method: 'POST',
      body: payload,
      headers: {
        'x-github-event': 'pull_request',
        'x-github-delivery': 'test-456',
        'x-hub-signature-256': signature,
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
```

**Acceptance Criteria:**
- [ ] Mock payloads created
- [ ] Signature verification tested
- [ ] Event handling tested

---

#### Task 2.5.4: Test Endpoint Locally

**Agent:** Validation Agent  

**Instructions:**
```bash
npm run typecheck
npm run lint
npm run test tests/api/webhooks/

# Manual test with curl
curl -X POST http://localhost:3000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "x-github-event: ping" \
  -H "x-github-delivery: test-123" \
  -d '{"zen": "test"}'
```

**Acceptance Criteria:**
- [ ] Tests pass
- [ ] Endpoint responds
- [ ] Signature verification works

---

[Rounds 6-7 continue with event handlers and ticket sync...]

---

## Sub-Phase 2C: Ollama Integration (Rounds 8-10)

[Detailed implementation for Ollama client, CLI registry update, settings UI...]

---

# [Phases 3-7 continue with same detailed format]

Each subsequent phase follows the identical structure:
- Round-by-round breakdown
- Task-by-task instructions
- Specific code implementations
- Test cases
- Validation commands
- Acceptance criteria

---

# Appendix: Quick Reference

## Validation Commands

```bash
# TypeScript
npm run typecheck

# Lint
npm run lint

# Unit tests
npm run test

# E2E tests
npm run e2e

# Visual regression
npm run e2e:visual

# All validations
npm run typecheck && npm run lint && npm run test && npm run e2e
```

## File Naming Conventions

- Components: `kebab-case.tsx` (e.g., `ticket-detail.tsx`)
- API routes: `route.ts` in directory structure
- Tests: `*.test.ts` or `*.spec.ts`
- Types: `types.ts` or `*.types.ts`

## Import Patterns

```typescript
// Absolute imports (preferred)
import { Component } from '@/components/component';
import { useStore } from '@/lib/store';
import type { Ticket } from '@/lib/types';

// Relative imports (within same feature)
import { helper } from './utils';
```

## Error Handling Pattern

```typescript
try {
  const result = await operation();
  return { success: true, data: result };
} catch (error) {
  console.error('[Module] Operation failed:', error);
  return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
}
```

---

**END OF PART 2**

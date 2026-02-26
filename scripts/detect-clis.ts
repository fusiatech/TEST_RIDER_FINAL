#!/usr/bin/env npx tsx
/**
 * CLI detection & auth-status checker for SwarmUI.
 *
 * Usage:  npx tsx scripts/detect-clis.ts
 *
 * Detects which CLI agent providers are installed, checks basic
 * authentication/readiness, and prints a summary table with setup
 * instructions for any that are missing.
 */

import { execSync } from 'child_process';

/* ── Types ────────────────────────────────────────────────────── */

interface CLICheck {
  id: string;
  name: string;
  command: string;
  installed: boolean;
  version: string;
  authenticated: boolean;
  authDetail: string;
  setupUrl: string;
}

/* ── Setup URLs / instructions (no guessing package names) ───── */

const CLI_DEFS: ReadonlyArray<{
  id: string;
  name: string;
  command: string;
  setupUrl: string;
}> = [
  {
    id: 'cursor',
    name: 'Cursor CLI',
    command: 'cursor',
    setupUrl:
      'Install Cursor from https://cursor.com/downloads — enable CLI via Command Palette > "Install \'cursor\' command"',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    command: 'gemini',
    setupUrl: 'See https://github.com/google-gemini/gemini-cli for installation instructions',
  },
  {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    setupUrl: 'See https://docs.anthropic.com/en/docs/claude-code for installation instructions',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    command: 'gh',
    setupUrl:
      'Install GitHub CLI from https://cli.github.com — then run: gh extension install github/gh-copilot',
  },
  {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    command: 'codex',
    setupUrl: 'See https://github.com/openai/codex for installation instructions',
  },
  {
    id: 'rovo',
    name: 'Rovo Dev (acli)',
    command: 'acli',
    setupUrl: 'See https://developer.atlassian.com/cloud/acli/ for installation instructions',
  },
];

/* ── Helpers ──────────────────────────────────────────────────── */

function tryExec(cmd: string): { ok: boolean; stdout: string } {
  try {
    const stdout = execSync(cmd, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
      encoding: 'utf-8',
    }).trim();
    return { ok: true, stdout };
  } catch {
    return { ok: false, stdout: '' };
  }
}

function isInstalled(command: string): boolean {
  const which = process.platform === 'win32' ? 'where' : 'which';
  return tryExec(`${which} ${command}`).ok;
}

function getVersion(command: string): string {
  const { ok, stdout } = tryExec(`${command} --version`);
  if (!ok) {
    return 'unknown';
  }
  const firstLine = stdout.split('\n')[0] ?? '';
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine;
}

/* ── Auth checks ──────────────────────────────────────────────── */

function checkAuth(id: string): { authenticated: boolean; detail: string } {
  switch (id) {
    case 'cursor': {
      const { ok } = tryExec('cursor --version');
      return {
        authenticated: ok,
        detail: ok ? 'CLI responds' : 'CLI not responding',
      };
    }
    case 'gemini': {
      const hasKey = typeof process.env['GOOGLE_API_KEY'] === 'string' &&
        process.env['GOOGLE_API_KEY'].length > 0;
      return {
        authenticated: hasKey,
        detail: hasKey ? 'GOOGLE_API_KEY set' : 'GOOGLE_API_KEY not set',
      };
    }
    case 'claude': {
      const { ok } = tryExec('claude --version');
      return {
        authenticated: ok,
        detail: ok ? 'CLI responds' : 'CLI not responding',
      };
    }
    case 'copilot': {
      const { ok, stdout } = tryExec('gh auth status');
      if (!ok) {
        return { authenticated: false, detail: 'gh not authenticated' };
      }
      const loggedIn = stdout.includes('Logged in');
      return {
        authenticated: loggedIn,
        detail: loggedIn ? 'gh authenticated' : 'gh auth incomplete',
      };
    }
    case 'codex': {
      const hasKey = typeof process.env['OPENAI_API_KEY'] === 'string' &&
        process.env['OPENAI_API_KEY'].length > 0;
      return {
        authenticated: hasKey,
        detail: hasKey ? 'OPENAI_API_KEY set' : 'OPENAI_API_KEY not set',
      };
    }
    case 'rovo': {
      const { ok } = tryExec('acli --version');
      return {
        authenticated: ok,
        detail: ok ? 'CLI responds' : 'CLI not responding',
      };
    }
    default:
      return { authenticated: false, detail: 'unknown provider' };
  }
}

/* ── Main ─────────────────────────────────────────────────────── */

function detectCLIs(): CLICheck[] {
  return CLI_DEFS.map((def) => {
    const installed = isInstalled(def.command);
    const version = installed ? getVersion(def.command) : '—';
    const auth = installed
      ? checkAuth(def.id)
      : { authenticated: false, detail: 'not installed' };

    return {
      id: def.id,
      name: def.name,
      command: def.command,
      installed,
      version,
      authenticated: auth.authenticated,
      authDetail: auth.detail,
      setupUrl: def.setupUrl,
    };
  });
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function printResults(checks: CLICheck[]): void {
  const installed = checks.filter((c) => c.installed);
  const missing = checks.filter((c) => !c.installed);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              SwarmUI — CLI Agent Detection                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('  ' + padRight('CLI', 22) + padRight('Installed', 12) + padRight('Auth', 10) + 'Detail');
  console.log('  ' + '─'.repeat(70));

  for (const c of checks) {
    const instIcon = c.installed ? '✅' : '❌';
    const authIcon = c.authenticated ? '✅' : '⚠️ ';
    console.log(
      '  ' +
        padRight(c.name, 22) +
        padRight(instIcon, 12) +
        padRight(authIcon, 10) +
        c.authDetail
    );
  }

  if (installed.length > 0) {
    console.log(`\n  Versions:`);
    for (const c of installed) {
      console.log(`    ${c.name}: ${c.version}`);
    }
  }

  if (missing.length > 0) {
    console.log('\n  ┌─ Setup Instructions ──────────────────────────────────┐');
    for (const c of missing) {
      console.log(`  │  ${c.name}:`);
      console.log(`  │    ${c.setupUrl}`);
    }
    console.log('  └──────────────────────────────────────────────────────┘');
  }

  const total = checks.length;
  const installedCount = installed.length;
  const authCount = checks.filter((c) => c.authenticated).length;
  console.log(
    `\n  Summary: ${installedCount}/${total} installed, ${authCount}/${total} authenticated\n`
  );
}

/* ── Entry point ──────────────────────────────────────────────── */

const results = detectCLIs();
printResults(results);

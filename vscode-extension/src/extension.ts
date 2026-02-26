import * as vscode from 'vscode';
import WebSocket from 'ws';

/* ── Types mirroring WSMessage from lib/types.ts ─────────────── */

type AgentStatusValue =
  | 'pending'
  | 'spawning'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface StartSwarmMessage {
  type: 'start-swarm';
  prompt: string;
  sessionId: string;
}

interface InsertCodeMessage {
  type: 'insert-code';
  code: string;
  filePath?: string;
}

interface AgentStatusMessage {
  type: 'agent-status';
  agentId: string;
  status: AgentStatusValue;
  exitCode?: number;
}

interface SwarmErrorMessage {
  type: 'swarm-error';
  error: string;
}

interface PingMessage {
  type: 'ping';
}

interface PongMessage {
  type: 'pong';
}

type IncomingWSMessage =
  | InsertCodeMessage
  | AgentStatusMessage
  | SwarmErrorMessage
  | PongMessage;

type OutgoingWSMessage = StartSwarmMessage | PingMessage;

/* ── Constants ────────────────────────────────────────────────── */

const MAX_RECONNECT_RETRIES = 5;
const RECONNECT_DELAY_MS = 5000;
const STATUS_CONNECTED = '$(circle-filled) SwarmUI';
const STATUS_DISCONNECTED = '$(circle-outline) SwarmUI';

/* ── Extension State ──────────────────────────────────────────── */

let ws: WebSocket | null = null;
let statusBarItem: vscode.StatusBarItem;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectCount = 0;
let isDeactivating = false;

/* ── Activation ───────────────────────────────────────────────── */

export function activate(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  updateStatusBar(false);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('swarm-ui.insertCode', insertCodeCommand)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'swarm-ui.sendSelection',
      sendSelectionCommand
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('swarm-ui.sendTask', sendTaskCommand)
  );

  connectWebSocket();
}

/* ── Deactivation ─────────────────────────────────────────────── */

export function deactivate(): void {
  isDeactivating = true;
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

/* ── WebSocket Connection ─────────────────────────────────────── */

function getServerUrl(): string {
  const config = vscode.workspace.getConfiguration('swarmUI');
  return config.get<string>('serverUrl', 'ws://localhost:3000');
}

function connectWebSocket(): void {
  if (isDeactivating) {
    return;
  }

  const url = getServerUrl();

  try {
    ws = new WebSocket(url);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `SwarmUI: Failed to create WebSocket: ${message}`
    );
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    reconnectCount = 0;
    updateStatusBar(true);
    vscode.window.showInformationMessage('SwarmUI: Connected to server');
  });

  ws.on('message', (data: WebSocket.Data) => {
    handleIncomingMessage(data);
  });

  ws.on('close', () => {
    updateStatusBar(false);
    if (!isDeactivating) {
      scheduleReconnect();
    }
  });

  ws.on('error', (err: Error) => {
    updateStatusBar(false);
    vscode.window.showWarningMessage(`SwarmUI: WebSocket error — ${err.message}`);
  });
}

function scheduleReconnect(): void {
  if (isDeactivating) {
    return;
  }
  if (reconnectCount >= MAX_RECONNECT_RETRIES) {
    vscode.window.showErrorMessage(
      `SwarmUI: Could not reconnect after ${MAX_RECONNECT_RETRIES} attempts. Use the command palette to retry.`
    );
    return;
  }
  reconnectCount++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connectWebSocket();
  }, RECONNECT_DELAY_MS);
}

/* ── Status Bar ───────────────────────────────────────────────── */

function updateStatusBar(connected: boolean): void {
  if (connected) {
    statusBarItem.text = STATUS_CONNECTED;
    statusBarItem.backgroundColor = undefined;
    statusBarItem.tooltip = 'SwarmUI: Connected';
  } else {
    statusBarItem.text = STATUS_DISCONNECTED;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.errorBackground'
    );
    statusBarItem.tooltip = 'SwarmUI: Disconnected';
  }
}

/* ── Incoming Message Handler ─────────────────────────────────── */

function handleIncomingMessage(data: WebSocket.Data): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.toString());
  } catch {
    return;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('type' in parsed)
  ) {
    return;
  }

  const msg = parsed as { type: string };

  switch (msg.type) {
    case 'insert-code':
      handleInsertCode(parsed as InsertCodeMessage);
      break;
    case 'agent-status':
      handleAgentStatus(parsed as AgentStatusMessage);
      break;
    case 'swarm-error':
      handleSwarmError(parsed as SwarmErrorMessage);
      break;
    case 'pong':
      break;
    default:
      break;
  }
}

/* ── Message Handlers ─────────────────────────────────────────── */

function handleInsertCode(msg: InsertCodeMessage): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      'SwarmUI: No active editor to insert code into'
    );
    return;
  }

  const code = msg.code;
  if (typeof code !== 'string' || code.length === 0) {
    return;
  }

  editor
    .edit((editBuilder: vscode.TextEditorEdit) => {
      editBuilder.insert(editor.selection.active, code);
    })
    .then(
      (success: boolean) => {
        if (success) {
          vscode.window.showInformationMessage('SwarmUI: Code inserted');
        } else {
          vscode.window.showWarningMessage(
            'SwarmUI: Failed to insert code'
          );
        }
      },
      (err: Error) => {
        vscode.window.showErrorMessage(
          `SwarmUI: Insert failed — ${err.message}`
        );
      }
    );
}

function handleAgentStatus(msg: AgentStatusMessage): void {
  const { agentId, status } = msg;
  if (status === 'completed') {
    vscode.window.showInformationMessage(
      `SwarmUI: Agent "${agentId}" completed`
    );
  } else if (status === 'failed') {
    const exitInfo =
      msg.exitCode !== undefined ? ` (exit code ${msg.exitCode})` : '';
    vscode.window.showWarningMessage(
      `SwarmUI: Agent "${agentId}" failed${exitInfo}`
    );
  }
}

function handleSwarmError(msg: SwarmErrorMessage): void {
  vscode.window.showErrorMessage(`SwarmUI Error: ${msg.error}`);
}

/* ── Commands ─────────────────────────────────────────────────── */

function insertCodeCommand(): void {
  vscode.window.showInformationMessage(
    'SwarmUI: insertCode is triggered by the server via WebSocket'
  );
}

function sendSelectionCommand(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('SwarmUI: No active editor');
    return;
  }

  const selection = editor.document.getText(editor.selection);
  if (!selection || selection.trim().length === 0) {
    vscode.window.showWarningMessage(
      'SwarmUI: No text selected. Select code first.'
    );
    return;
  }

  const message: StartSwarmMessage = {
    type: 'start-swarm',
    prompt: selection,
    sessionId: `vscode-${Date.now()}`,
  };

  sendMessage(message);
}

async function sendTaskCommand(): Promise<void> {
  const input = await vscode.window.showInputBox({
    prompt: 'Describe the task to send to the swarm',
    placeHolder: 'e.g., Refactor the auth module to use JWT tokens',
  });

  if (!input || input.trim().length === 0) {
    return;
  }

  const message: StartSwarmMessage = {
    type: 'start-swarm',
    prompt: input,
    sessionId: `vscode-${Date.now()}`,
  };

  sendMessage(message);
}

/* ── Outgoing Message Sender ──────────────────────────────────── */

function sendMessage(msg: OutgoingWSMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    vscode.window.showErrorMessage(
      'SwarmUI: Not connected to server. Check your connection.'
    );
    return;
  }

  try {
    ws.send(JSON.stringify(msg));
    vscode.window.showInformationMessage('SwarmUI: Task sent to swarm');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `SwarmUI: Failed to send message — ${message}`
    );
  }
}

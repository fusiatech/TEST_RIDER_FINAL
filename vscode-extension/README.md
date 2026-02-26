# SwarmUI — VS Code Extension

Connect VS Code to the [SwarmUI](../README.md) parallel agent orchestrator. Send tasks to the swarm directly from your editor and receive code insertions from running agents.

## Installation

### From VSIX (local build)

```bash
cd vscode-extension
npm install
npm run compile
npx @vscode/vsce package   # produces swarm-ui-vscode-1.0.0.vsix
code --install-extension swarm-ui-vscode-1.0.0.vsix
```

### From Marketplace

_Not yet published._ Check the project README for updates.

## Configuration

Open **Settings** and search for **SwarmUI**:

| Setting             | Default                  | Description                        |
| ------------------- | ------------------------ | ---------------------------------- |
| `swarmUI.serverUrl` | `ws://localhost:5175`    | WebSocket server URL for SwarmUI   |

The default port `5175` matches the SwarmUI WebSocket server defined in `server/ws-server.ts`.

## Commands

| Command                            | Description                                              |
| ---------------------------------- | -------------------------------------------------------- |
| **SwarmUI: Send Selection as Task** | Send the selected text from the editor as a swarm task  |
| **SwarmUI: Send Task to Swarm**     | Open an input box to describe a task and send it        |
| **SwarmUI: Insert Code at Cursor**  | (Internal) Triggered by the server to insert code       |

## Usage

1. **Start the SwarmUI server** (`npm run dev` in the project root).
2. Open VS Code — the extension activates automatically and connects via WebSocket.
3. The status bar shows connection status: **$(circle-filled)** = connected, **$(circle-outline)** = disconnected.
4. **Context menu**: Right-click selected code → *SwarmUI: Send Selection as Task*.
5. **Command palette**: `Ctrl+Shift+P` → *SwarmUI: Send Task to Swarm* → type a task description.
6. Agents may send code back via the `insert-code` WebSocket message, which inserts at the cursor position.

## Development

```bash
npm run watch   # recompile on changes
```

Press `F5` in VS Code (with this folder open) to launch an Extension Development Host for testing.

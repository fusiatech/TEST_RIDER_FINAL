'use client'

import type * as Monaco from 'monaco-editor'

export interface LSPServerConfig {
  language: string
  serverUrl: string
  rootUri?: string
}

export interface LSPCapabilities {
  completionProvider?: boolean
  hoverProvider?: boolean
  definitionProvider?: boolean
  referencesProvider?: boolean
  documentSymbolProvider?: boolean
  signatureHelpProvider?: boolean
  codeActionProvider?: boolean
}

interface LSPMessage {
  jsonrpc: '2.0'
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface Position {
  line: number
  character: number
}

interface Range {
  start: Position
  end: Position
}

interface Location {
  uri: string
  range: Range
}

interface CompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: string | { kind: string; value: string }
  insertText?: string
  insertTextFormat?: number
  textEdit?: { range: Range; newText: string }
}

interface Hover {
  contents: string | { kind: string; value: string } | Array<string | { kind: string; value: string }>
  range?: Range
}

interface SignatureHelp {
  signatures: SignatureInformation[]
  activeSignature?: number
  activeParameter?: number
}

interface SignatureInformation {
  label: string
  documentation?: string | { kind: string; value: string }
  parameters?: ParameterInformation[]
}

interface ParameterInformation {
  label: string | [number, number]
  documentation?: string | { kind: string; value: string }
}

interface CodeAction {
  title: string
  kind?: string
  diagnostics?: Array<{
    range: Range
    message: string
    severity?: number
    source?: string
    code?: string | number
  }>
  isPreferred?: boolean
  edit?: WorkspaceEdit
  command?: Command
}

interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>
  documentChanges?: Array<{
    textDocument: { uri: string; version?: number }
    edits: TextEdit[]
  }>
}

interface TextEdit {
  range: Range
  newText: string
}

interface Command {
  title: string
  command: string
  arguments?: unknown[]
}

type MessageHandler = (message: LSPMessage) => void

export class LSPClient {
  private ws: WebSocket | null = null
  private messageId = 0
  private pendingRequests = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>()
  private serverCapabilities: LSPCapabilities = {}
  private initialized = false
  private documentVersions = new Map<string, number>()
  private onNotification: MessageHandler | null = null

  constructor(
    private config: LSPServerConfig,
    private monaco: typeof Monaco | null = null
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.serverUrl)

        this.ws.onopen = async () => {
          try {
            await this.initialize()
            resolve()
          } catch (err) {
            reject(err)
          }
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (error) => {
          console.error('[LSP] WebSocket error:', error)
          reject(new Error('WebSocket connection failed'))
        }

        this.ws.onclose = () => {
          console.log('[LSP] WebSocket closed')
          this.initialized = false
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.initialized = false
    this.pendingRequests.clear()
    this.documentVersions.clear()
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.initialized
  }

  getCapabilities(): LSPCapabilities {
    return this.serverCapabilities
  }

  setNotificationHandler(handler: MessageHandler): void {
    this.onNotification = handler
  }

  private async initialize(): Promise<void> {
    const initResult = await this.sendRequest('initialize', {
      processId: null,
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              deprecatedSupport: true,
              preselectSupport: true,
            },
            contextSupport: true,
          },
          hover: {
            contentFormat: ['markdown', 'plaintext'],
          },
          signatureHelp: {
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: { labelOffsetSupport: true },
              activeParameterSupport: true,
            },
            contextSupport: true,
          },
          definition: { linkSupport: true },
          references: {},
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
          codeAction: {
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: [
                  'quickfix',
                  'refactor',
                  'refactor.extract',
                  'refactor.inline',
                  'refactor.rewrite',
                  'source',
                  'source.organizeImports',
                  'source.fixAll',
                ],
              },
            },
            isPreferredSupport: true,
            resolveSupport: { properties: ['edit'] },
          },
          synchronization: {
            didSave: true,
            willSave: true,
            willSaveWaitUntil: true,
          },
        },
        workspace: {
          workspaceFolders: true,
          configuration: true,
          applyEdit: true,
        },
      },
      rootUri: this.config.rootUri || null,
      workspaceFolders: this.config.rootUri
        ? [{ uri: this.config.rootUri, name: 'workspace' }]
        : null,
    }) as { capabilities: Record<string, unknown> }

    this.serverCapabilities = {
      completionProvider: !!initResult.capabilities?.completionProvider,
      hoverProvider: !!initResult.capabilities?.hoverProvider,
      definitionProvider: !!initResult.capabilities?.definitionProvider,
      referencesProvider: !!initResult.capabilities?.referencesProvider,
      documentSymbolProvider: !!initResult.capabilities?.documentSymbolProvider,
      signatureHelpProvider: !!initResult.capabilities?.signatureHelpProvider,
      codeActionProvider: !!initResult.capabilities?.codeActionProvider,
    }

    await this.sendNotification('initialized', {})
    this.initialized = true
    console.log('[LSP] Initialized with capabilities:', this.serverCapabilities)
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }

      const id = ++this.messageId
      const message: LSPMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      }

      this.pendingRequests.set(id, { resolve, reject })
      this.ws.send(JSON.stringify(message))
    })
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[LSP] Cannot send notification, WebSocket not connected')
      return
    }

    const message: LSPMessage = {
      jsonrpc: '2.0',
      method,
      params,
    }

    this.ws.send(JSON.stringify(message))
  }

  private handleMessage(data: string): void {
    try {
      const message: LSPMessage = JSON.parse(data)

      if (message.id !== undefined && this.pendingRequests.has(message.id)) {
        const { resolve, reject } = this.pendingRequests.get(message.id)!
        this.pendingRequests.delete(message.id)

        if (message.error) {
          reject(new Error(message.error.message))
        } else {
          resolve(message.result)
        }
      } else if (message.method) {
        this.handleNotification(message)
      }
    } catch (err) {
      console.error('[LSP] Failed to parse message:', err)
    }
  }

  private handleNotification(message: LSPMessage): void {
    if (this.onNotification) {
      this.onNotification(message)
    }

    switch (message.method) {
      case 'textDocument/publishDiagnostics':
        this.handleDiagnostics(message.params as { uri: string; diagnostics: unknown[] })
        break
      case 'window/logMessage':
      case 'window/showMessage':
        console.log('[LSP Server]', message.params)
        break
    }
  }

  private handleDiagnostics(params: { uri: string; diagnostics: unknown[] }): void {
    if (!this.monaco) return

    const model = this.monaco.editor.getModels().find((m) => m.uri.toString() === params.uri)
    if (!model) return

    const markers = (params.diagnostics as Array<{
      range: Range
      message: string
      severity?: number
      source?: string
      code?: string | number
    }>).map((diag) => ({
      startLineNumber: diag.range.start.line + 1,
      startColumn: diag.range.start.character + 1,
      endLineNumber: diag.range.end.line + 1,
      endColumn: diag.range.end.character + 1,
      message: diag.message,
      severity: this.mapSeverity(diag.severity),
      source: diag.source,
      code: diag.code?.toString(),
    }))

    this.monaco.editor.setModelMarkers(model, 'lsp', markers)
  }

  private mapSeverity(severity?: number): Monaco.MarkerSeverity {
    if (!this.monaco) return 8
    switch (severity) {
      case 1: return this.monaco.MarkerSeverity.Error
      case 2: return this.monaco.MarkerSeverity.Warning
      case 3: return this.monaco.MarkerSeverity.Info
      case 4: return this.monaco.MarkerSeverity.Hint
      default: return this.monaco.MarkerSeverity.Info
    }
  }

  async openDocument(uri: string, languageId: string, text: string): Promise<void> {
    const version = 1
    this.documentVersions.set(uri, version)

    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text,
      },
    })
  }

  async closeDocument(uri: string): Promise<void> {
    this.documentVersions.delete(uri)

    this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    })
  }

  async changeDocument(uri: string, text: string): Promise<void> {
    const version = (this.documentVersions.get(uri) || 0) + 1
    this.documentVersions.set(uri, version)

    this.sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    })
  }

  async saveDocument(uri: string, text: string): Promise<void> {
    this.sendNotification('textDocument/didSave', {
      textDocument: { uri },
      text,
    })
  }

  async getCompletion(uri: string, position: Position): Promise<CompletionItem[]> {
    if (!this.serverCapabilities.completionProvider) {
      return []
    }

    try {
      const result = await this.sendRequest('textDocument/completion', {
        textDocument: { uri },
        position,
      }) as { items?: CompletionItem[] } | CompletionItem[] | null

      if (!result) return []
      if (Array.isArray(result)) return result
      return result.items || []
    } catch (err) {
      console.error('[LSP] Completion error:', err)
      return []
    }
  }

  async getHover(uri: string, position: Position): Promise<Hover | null> {
    if (!this.serverCapabilities.hoverProvider) {
      return null
    }

    try {
      const result = await this.sendRequest('textDocument/hover', {
        textDocument: { uri },
        position,
      }) as Hover | null

      return result
    } catch (err) {
      console.error('[LSP] Hover error:', err)
      return null
    }
  }

  async getDefinition(uri: string, position: Position): Promise<Location[]> {
    if (!this.serverCapabilities.definitionProvider) {
      return []
    }

    try {
      const result = await this.sendRequest('textDocument/definition', {
        textDocument: { uri },
        position,
      }) as Location | Location[] | null

      if (!result) return []
      if (Array.isArray(result)) return result
      return [result]
    } catch (err) {
      console.error('[LSP] Definition error:', err)
      return []
    }
  }

  async getReferences(uri: string, position: Position, includeDeclaration = true): Promise<Location[]> {
    if (!this.serverCapabilities.referencesProvider) {
      return []
    }

    try {
      const result = await this.sendRequest('textDocument/references', {
        textDocument: { uri },
        position,
        context: { includeDeclaration },
      }) as Location[] | null

      return result || []
    } catch (err) {
      console.error('[LSP] References error:', err)
      return []
    }
  }

  async getSignatureHelp(uri: string, position: Position): Promise<SignatureHelp | null> {
    if (!this.serverCapabilities.signatureHelpProvider) {
      return null
    }

    try {
      const result = await this.sendRequest('textDocument/signatureHelp', {
        textDocument: { uri },
        position,
      }) as SignatureHelp | null

      return result
    } catch (err) {
      console.error('[LSP] Signature help error:', err)
      return null
    }
  }

  async getCodeActions(
    uri: string,
    range: Range,
    diagnostics: Array<{ range: Range; message: string; severity?: number; source?: string; code?: string | number }>
  ): Promise<CodeAction[]> {
    if (!this.serverCapabilities.codeActionProvider) {
      return []
    }

    try {
      const result = await this.sendRequest('textDocument/codeAction', {
        textDocument: { uri },
        range,
        context: {
          diagnostics,
          only: ['quickfix', 'refactor', 'source'],
        },
      }) as CodeAction[] | null

      return result || []
    } catch (err) {
      console.error('[LSP] Code action error:', err)
      return []
    }
  }

  async executeCommand(command: string, args?: unknown[]): Promise<unknown> {
    try {
      return await this.sendRequest('workspace/executeCommand', {
        command,
        arguments: args,
      })
    } catch (err) {
      console.error('[LSP] Execute command error:', err)
      return null
    }
  }

  async applyEdit(edit: WorkspaceEdit): Promise<boolean> {
    try {
      const result = await this.sendRequest('workspace/applyEdit', { edit }) as { applied: boolean }
      return result?.applied ?? false
    } catch (err) {
      console.error('[LSP] Apply edit error:', err)
      return false
    }
  }
}

export function filePathToUri(filePath: string): string {
  if (filePath.startsWith('file://')) return filePath
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.startsWith('/')) {
    return `file://${normalized}`
  }
  return `file:///${normalized}`
}

export function uriToFilePath(uri: string): string {
  if (!uri.startsWith('file://')) return uri
  let path = uri.replace('file://', '')
  if (path.startsWith('/') && /^\/[A-Za-z]:/.test(path)) {
    path = path.slice(1)
  }
  return path.replace(/\//g, '\\')
}

const LSP_LANGUAGE_MAP: Record<string, string> = {
  typescript: 'typescript',
  typescriptreact: 'typescriptreact',
  javascript: 'javascript',
  javascriptreact: 'javascriptreact',
  python: 'python',
  rust: 'rust',
  go: 'go',
  java: 'java',
  csharp: 'csharp',
  cpp: 'cpp',
  c: 'c',
}

export function getLanguageId(monacoLanguage: string): string {
  return LSP_LANGUAGE_MAP[monacoLanguage] || monacoLanguage
}

export class LSPManager {
  private clients = new Map<string, LSPClient>()
  private monaco: typeof Monaco | null = null

  setMonaco(monaco: typeof Monaco): void {
    this.monaco = monaco
  }

  async connectLanguageServer(config: LSPServerConfig): Promise<LSPClient> {
    const existing = this.clients.get(config.language)
    if (existing?.isConnected()) {
      return existing
    }

    const client = new LSPClient(config, this.monaco)
    await client.connect()
    this.clients.set(config.language, client)
    return client
  }

  getClient(language: string): LSPClient | undefined {
    return this.clients.get(language)
  }

  disconnectAll(): void {
    for (const client of this.clients.values()) {
      client.disconnect()
    }
    this.clients.clear()
  }

  disconnectLanguage(language: string): void {
    const client = this.clients.get(language)
    if (client) {
      client.disconnect()
      this.clients.delete(language)
    }
  }
}

export const lspManager = new LSPManager()

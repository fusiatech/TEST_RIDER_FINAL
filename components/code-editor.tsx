'use client'

import { useTheme } from 'next-themes'
import Editor, { type OnChange, type BeforeMount, type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { Skeleton } from '@/components/ui/skeleton'
import { useCallback, useRef, useEffect, useState } from 'react'
import { useSwarmStore, type DebugBreakpoint } from '@/lib/store'
import { generateId } from '@/lib/utils'
import { LSPClient, filePathToUri, getLanguageId } from '@/lib/lsp-client'

interface CodeEditorProps {
  filePath?: string
  content: string
  language?: string
  onChange?: (value: string) => void
  readOnly?: boolean
  breakpoints?: DebugBreakpoint[]
  currentLine?: number | null
  onBreakpointToggle?: (line: number) => void
  enableLSP?: boolean
  workspaceRoot?: string
  onGoToDefinition?: (filePath: string, line: number, column: number) => void
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    json: 'json',
    css: 'css',
    html: 'html',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    sh: 'shell',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql',
    graphql: 'graphql',
    toml: 'toml',
    xml: 'xml',
  }
  return map[ext ?? ''] ?? 'plaintext'
}

function mapCompletionKind(kind: number | undefined, monaco: typeof Monaco): Monaco.languages.CompletionItemKind {
  if (kind === undefined) return monaco.languages.CompletionItemKind.Text

  const kindMap: Record<number, Monaco.languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    11: monaco.languages.CompletionItemKind.Unit,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    16: monaco.languages.CompletionItemKind.Color,
    17: monaco.languages.CompletionItemKind.File,
    18: monaco.languages.CompletionItemKind.Reference,
    19: monaco.languages.CompletionItemKind.Folder,
    20: monaco.languages.CompletionItemKind.EnumMember,
    21: monaco.languages.CompletionItemKind.Constant,
    22: monaco.languages.CompletionItemKind.Struct,
    23: monaco.languages.CompletionItemKind.Event,
    24: monaco.languages.CompletionItemKind.Operator,
    25: monaco.languages.CompletionItemKind.TypeParameter,
  }

  return kindMap[kind] ?? monaco.languages.CompletionItemKind.Text
}

function mapMarkerSeverityToLSP(severity: Monaco.MarkerSeverity, monaco: typeof Monaco): number {
  switch (severity) {
    case monaco.MarkerSeverity.Error: return 1
    case monaco.MarkerSeverity.Warning: return 2
    case monaco.MarkerSeverity.Info: return 3
    case monaco.MarkerSeverity.Hint: return 4
    default: return 3
  }
}

function EditorLoading() {
  return (
    <div className="flex h-full w-full flex-col gap-2 p-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  )
}

export function CodeEditor({
  filePath,
  content,
  language,
  onChange,
  readOnly = false,
  breakpoints: propBreakpoints,
  currentLine: propCurrentLine,
  onBreakpointToggle,
  enableLSP = false,
  workspaceRoot,
  onGoToDefinition,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme()
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light'
  const lang = language ?? (filePath ? detectLanguage(filePath) : 'plaintext')
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const decorationsRef = useRef<string[]>([])
  const lspClientRef = useRef<LSPClient | null>(null)
  const [lspConnected, setLspConnected] = useState(false)
  const [lspStatus, setLspStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [lspError, setLspError] = useState<string | null>(null)
  const [lspCapabilities, setLspCapabilities] = useState<string[]>([])
  const reconnectAttemptRef = useRef(0)
  const maxReconnectAttempts = 3
  const reconnectDelayMs = 2000

  const storeBreakpoints = useSwarmStore((s) => filePath ? s.breakpoints.get(filePath) || [] : [])
  const currentDebugLine = useSwarmStore((s) => s.currentDebugLine)
  const addBreakpoint = useSwarmStore((s) => s.addBreakpoint)
  const removeBreakpoint = useSwarmStore((s) => s.removeBreakpoint)

  const breakpoints = propBreakpoints ?? storeBreakpoints
  const currentLine = propCurrentLine ?? (currentDebugLine && currentDebugLine.file === filePath ? currentDebugLine.line : undefined)

  const handleChange: OnChange = (newValue) => {
    onChange?.(newValue ?? '')
  }

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    monacoRef.current = monaco

    const ts = monaco.languages.typescript
    const compilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      jsx: ts.JsxEmit.ReactJSX,
      allowSyntheticDefaultImports: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      allowJs: true,
      checkJs: true,
    }

    ts.typescriptDefaults.setCompilerOptions(compilerOptions)
    ts.javascriptDefaults.setCompilerOptions(compilerOptions)

    ts.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
    })
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
    })

    monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true)
    monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true)

    const reactTypes = `
declare namespace React {
  type ReactNode = string | number | boolean | null | undefined | React.ReactElement | React.ReactFragment | React.ReactPortal;
  type ReactElement<P = any> = { type: any; props: P; key: string | null };
  type ReactFragment = {} | Iterable<ReactNode>;
  type ReactPortal = { key: string | null; children: ReactNode };
  type FC<P = {}> = (props: P) => ReactElement | null;
  type PropsWithChildren<P = {}> = P & { children?: ReactNode };
  type CSSProperties = Record<string, string | number>;
  type MouseEvent<T = Element> = { target: T; preventDefault(): void; stopPropagation(): void };
  type ChangeEvent<T = Element> = { target: T & { value: string } };
  type FormEvent<T = Element> = { target: T; preventDefault(): void };
  type KeyboardEvent<T = Element> = { target: T; key: string; code: string };
  function useState<T>(initial: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
  function useEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
  function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly any[]): T;
  function useMemo<T>(factory: () => T, deps: readonly any[]): T;
  function useRef<T>(initial: T): { current: T };
  function useContext<T>(context: React.Context<T>): T;
  function createContext<T>(defaultValue: T): React.Context<T>;
  interface Context<T> { Provider: FC<{ value: T; children?: ReactNode }>; Consumer: FC<{ children: (value: T) => ReactNode }> }
  function memo<P extends object>(component: FC<P>): FC<P>;
  function forwardRef<T, P = {}>(render: (props: P, ref: React.Ref<T>) => ReactElement | null): FC<P & { ref?: React.Ref<T> }>;
  type Ref<T> = { current: T | null } | ((instance: T | null) => void) | null;
}
declare const React: typeof React;
export = React;
export as namespace React;
`

    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      reactTypes,
      'file:///node_modules/@types/react/index.d.ts'
    )
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      reactTypes,
      'file:///node_modules/@types/react/index.d.ts'
    )

    const nextTypes = `
declare module 'next/link' {
  import { FC, ReactNode } from 'react';
  interface LinkProps { href: string; as?: string; replace?: boolean; scroll?: boolean; shallow?: boolean; passHref?: boolean; prefetch?: boolean; locale?: string | false; children?: ReactNode; className?: string; }
  const Link: FC<LinkProps>;
  export default Link;
}
declare module 'next/image' {
  import { FC } from 'react';
  interface ImageProps { src: string; alt: string; width?: number; height?: number; fill?: boolean; loader?: (p: { src: string; width: number; quality?: number }) => string; quality?: number; priority?: boolean; loading?: 'lazy' | 'eager'; placeholder?: 'blur' | 'empty'; blurDataURL?: string; unoptimized?: boolean; className?: string; style?: React.CSSProperties; }
  const Image: FC<ImageProps>;
  export default Image;
}
declare module 'next/navigation' {
  export function useRouter(): { push(url: string): void; replace(url: string): void; back(): void; forward(): void; refresh(): void; prefetch(url: string): void; };
  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
  export function useParams<T extends Record<string, string | string[]> = Record<string, string | string[]>>(): T;
}
`

    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      nextTypes,
      'file:///node_modules/@types/next/index.d.ts'
    )
  }, [])

  const handleBreakpointClick = useCallback((line: number) => {
    if (!filePath) return

    if (onBreakpointToggle) {
      onBreakpointToggle(line)
      return
    }

    const existingBp = breakpoints.find((bp) => bp.line === line)
    if (existingBp) {
      removeBreakpoint(filePath, existingBp.id)
    } else {
      const newBp: DebugBreakpoint = {
        id: generateId(),
        file: filePath,
        line,
        enabled: true,
        verified: false,
      }
      addBreakpoint(filePath, newBp)
    }
  }, [filePath, breakpoints, addBreakpoint, removeBreakpoint, onBreakpointToggle])

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      // Trigger save - could emit an event here
    })

    editor.addCommand(monaco.KeyCode.F12, () => {
      editor.trigger('keyboard', 'editor.action.revealDefinition', null)
    })

    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.F12, () => {
      editor.trigger('keyboard', 'editor.action.peekDefinition', null)
    })

    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F12, () => {
      editor.trigger('keyboard', 'editor.action.goToReferences', null)
    })

    editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
          e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const lineNumber = e.target.position?.lineNumber
        if (lineNumber) {
          handleBreakpointClick(lineNumber)
        }
      }
    })
  }, [handleBreakpointClick])

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const decorations: Monaco.editor.IModelDeltaDecoration[] = []

    breakpoints.forEach((bp) => {
      if (bp.enabled) {
        decorations.push({
          range: new monaco.Range(bp.line, 1, bp.line, 1),
          options: {
            isWholeLine: false,
            glyphMarginClassName: 'debug-breakpoint-glyph',
            glyphMarginHoverMessage: { value: `Breakpoint at line ${bp.line}` },
          },
        })
      } else {
        decorations.push({
          range: new monaco.Range(bp.line, 1, bp.line, 1),
          options: {
            isWholeLine: false,
            glyphMarginClassName: 'debug-breakpoint-disabled-glyph',
            glyphMarginHoverMessage: { value: `Disabled breakpoint at line ${bp.line}` },
          },
        })
      }
    })

    if (currentLine) {
      decorations.push({
        range: new monaco.Range(currentLine, 1, currentLine, 1),
        options: {
          isWholeLine: true,
          className: 'debug-current-line',
          glyphMarginClassName: 'debug-current-line-glyph',
        },
      })
    }

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations)
  }, [breakpoints, currentLine])

  const registerLSPProviders = useCallback((client: LSPClient, monaco: typeof Monaco) => {
    const capabilities = client.getCapabilities()

    if (capabilities.hoverProvider) {
      monaco.languages.registerHoverProvider(['typescript', 'typescriptreact', 'javascript', 'javascriptreact'], {
        provideHover: async (model, position) => {
          if (!client.isConnected()) return null

          const uri = model.uri.toString()
          const hover = await client.getHover(uri, {
            line: position.lineNumber - 1,
            character: position.column - 1,
          })

          if (!hover) return null

          const contents = Array.isArray(hover.contents) ? hover.contents : [hover.contents]
          const markdownContents = contents.map((c) => {
            if (typeof c === 'string') {
              return { value: c }
            }
            return { value: c.value }
          })

          return {
            contents: markdownContents,
            range: hover.range ? new monaco.Range(
              hover.range.start.line + 1,
              hover.range.start.character + 1,
              hover.range.end.line + 1,
              hover.range.end.character + 1
            ) : undefined,
          }
        },
      })
    }

    if (capabilities.definitionProvider) {
      monaco.languages.registerDefinitionProvider(['typescript', 'typescriptreact', 'javascript', 'javascriptreact'], {
        provideDefinition: async (model, position) => {
          if (!client.isConnected()) return null

          const uri = model.uri.toString()
          const locations = await client.getDefinition(uri, {
            line: position.lineNumber - 1,
            character: position.column - 1,
          })

          if (!locations.length) return null

          return locations.map((loc) => ({
            uri: monaco.Uri.parse(loc.uri),
            range: new monaco.Range(
              loc.range.start.line + 1,
              loc.range.start.character + 1,
              loc.range.end.line + 1,
              loc.range.end.character + 1
            ),
          }))
        },
      })
    }

    if (capabilities.completionProvider) {
      monaco.languages.registerCompletionItemProvider(['typescript', 'typescriptreact', 'javascript', 'javascriptreact'], {
        triggerCharacters: ['.', '"', "'", '/', '<'],
        provideCompletionItems: async (model, position) => {
          if (!client.isConnected()) return { suggestions: [] }

          const uri = model.uri.toString()
          const items = await client.getCompletion(uri, {
            line: position.lineNumber - 1,
            character: position.column - 1,
          })

          const word = model.getWordUntilPosition(position)
          const defaultRange = new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn
          )

          const suggestions = items.map((item) => {
            const kind = mapCompletionKind(item.kind, monaco)
            const documentation = typeof item.documentation === 'string'
              ? item.documentation
              : item.documentation?.value

            return {
              label: item.label,
              kind,
              detail: item.detail,
              documentation,
              insertText: item.insertText || item.label,
              insertTextRules: item.insertTextFormat === 2
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : undefined,
              range: item.textEdit?.range ? new monaco.Range(
                item.textEdit.range.start.line + 1,
                item.textEdit.range.start.character + 1,
                item.textEdit.range.end.line + 1,
                item.textEdit.range.end.character + 1
              ) : defaultRange,
            }
          })

          return { suggestions }
        },
      })
    }

    if (capabilities.referencesProvider) {
      monaco.languages.registerReferenceProvider(['typescript', 'typescriptreact', 'javascript', 'javascriptreact'], {
        provideReferences: async (model, position, context) => {
          if (!client.isConnected()) return null

          const uri = model.uri.toString()
          const locations = await client.getReferences(uri, {
            line: position.lineNumber - 1,
            character: position.column - 1,
          }, context.includeDeclaration)

          return locations.map((loc) => ({
            uri: monaco.Uri.parse(loc.uri),
            range: new monaco.Range(
              loc.range.start.line + 1,
              loc.range.start.character + 1,
              loc.range.end.line + 1,
              loc.range.end.character + 1
            ),
          }))
        },
      })
    }

    if (capabilities.signatureHelpProvider) {
      monaco.languages.registerSignatureHelpProvider(['typescript', 'typescriptreact', 'javascript', 'javascriptreact'], {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp: async (model, position) => {
          if (!client.isConnected()) return null

          const uri = model.uri.toString()
          const result = await client.getSignatureHelp(uri, {
            line: position.lineNumber - 1,
            character: position.column - 1,
          })

          if (!result || !result.signatures.length) return null

          const signatures = result.signatures.map((sig) => {
            const documentation = typeof sig.documentation === 'string'
              ? sig.documentation
              : sig.documentation?.value

            const parameters = (sig.parameters || []).map((param) => {
              const paramDoc = typeof param.documentation === 'string'
                ? param.documentation
                : param.documentation?.value

              return {
                label: param.label,
                documentation: paramDoc,
              }
            })

            return {
              label: sig.label,
              documentation,
              parameters,
            }
          })

          return {
            value: {
              signatures,
              activeSignature: result.activeSignature ?? 0,
              activeParameter: result.activeParameter ?? 0,
            },
            dispose: () => {},
          }
        },
      })
    }

    if (capabilities.codeActionProvider) {
      monaco.languages.registerCodeActionProvider(['typescript', 'typescriptreact', 'javascript', 'javascriptreact'], {
        provideCodeActions: async (model, range, context) => {
          if (!client.isConnected()) return null

          const uri = model.uri.toString()
          const diagnostics = context.markers.map((marker) => ({
            range: {
              start: { line: marker.startLineNumber - 1, character: marker.startColumn - 1 },
              end: { line: marker.endLineNumber - 1, character: marker.endColumn - 1 },
            },
            message: marker.message,
            severity: mapMarkerSeverityToLSP(marker.severity, monaco),
            source: marker.source,
            code: marker.code?.toString(),
          }))

          const lspRange = {
            start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
            end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
          }

          const codeActions = await client.getCodeActions(uri, lspRange, diagnostics)

          if (!codeActions.length) return null

          const actions: Monaco.languages.CodeAction[] = codeActions.map((action) => {
            const monacoAction: Monaco.languages.CodeAction = {
              title: action.title,
              kind: action.kind,
              isPreferred: action.isPreferred,
            }

            if (action.edit?.changes) {
              const edits: Monaco.languages.IWorkspaceTextEdit[] = []
              for (const [editUri, textEdits] of Object.entries(action.edit.changes)) {
                for (const textEdit of textEdits) {
                  edits.push({
                    resource: monaco.Uri.parse(editUri),
                    textEdit: {
                      range: new monaco.Range(
                        textEdit.range.start.line + 1,
                        textEdit.range.start.character + 1,
                        textEdit.range.end.line + 1,
                        textEdit.range.end.character + 1
                      ),
                      text: textEdit.newText,
                    },
                    versionId: undefined,
                  })
                }
              }
              monacoAction.edit = { edits }
            }

            if (action.command) {
              monacoAction.command = {
                id: action.command.command,
                title: action.command.title,
                arguments: action.command.arguments,
              }
            }

            return monacoAction
          })

          return {
            actions,
            dispose: () => {},
          }
        },
      })
    }
  }, [])

  const connectLSP = useCallback(async (isReconnect = false) => {
    if (!enableLSP || !filePath || !monacoRef.current) return

    const lspLanguages = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact']
    if (!lspLanguages.includes(lang)) return

    setLspStatus('connecting')
    setLspError(null)

    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const rootUri = workspaceRoot ? filePathToUri(workspaceRoot) : undefined
      const serverUrl = `${wsProtocol}//${window.location.host}/api/lsp/ws?language=${getLanguageId(lang)}${rootUri ? `&rootUri=${encodeURIComponent(rootUri)}` : ''}`

      const client = new LSPClient(
        { language: getLanguageId(lang), serverUrl, rootUri },
        monacoRef.current
      )

      await client.connect()
      lspClientRef.current = client
      setLspConnected(true)
      setLspStatus('connected')
      reconnectAttemptRef.current = 0

      const capabilities = client.getCapabilities()
      const enabledCapabilities: string[] = []
      if (capabilities.completionProvider) enabledCapabilities.push('Completion')
      if (capabilities.hoverProvider) enabledCapabilities.push('Hover')
      if (capabilities.definitionProvider) enabledCapabilities.push('Go to Definition')
      if (capabilities.referencesProvider) enabledCapabilities.push('Find References')
      if (capabilities.signatureHelpProvider) enabledCapabilities.push('Signature Help')
      if (capabilities.codeActionProvider) enabledCapabilities.push('Code Actions')
      setLspCapabilities(enabledCapabilities)

      const uri = filePathToUri(filePath)
      await client.openDocument(uri, getLanguageId(lang), content)

      registerLSPProviders(client, monacoRef.current!)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed'
      console.error('[CodeEditor] LSP connection failed:', err)
      setLspStatus('error')
      setLspError(errorMessage)
      setLspConnected(false)
      setLspCapabilities([])

      if (!isReconnect && reconnectAttemptRef.current < maxReconnectAttempts) {
        reconnectAttemptRef.current++
        console.log(`[CodeEditor] Attempting LSP reconnect (${reconnectAttemptRef.current}/${maxReconnectAttempts})...`)
        setTimeout(() => connectLSP(true), reconnectDelayMs * reconnectAttemptRef.current)
      }
    }
  }, [enableLSP, filePath, lang, workspaceRoot, content, registerLSPProviders])

  const handleLSPReconnect = useCallback(() => {
    if (lspClientRef.current) {
      lspClientRef.current.disconnect()
      lspClientRef.current = null
    }
    reconnectAttemptRef.current = 0
    connectLSP()
  }, [connectLSP])

  useEffect(() => {
    if (!enableLSP || !filePath || !monacoRef.current) return

    const lspLanguages = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact']
    if (!lspLanguages.includes(lang)) return

    connectLSP()

    return () => {
      if (lspClientRef.current) {
        if (filePath) {
          lspClientRef.current.closeDocument(filePathToUri(filePath)).catch(() => {})
        }
        lspClientRef.current.disconnect()
        lspClientRef.current = null
        setLspConnected(false)
        setLspStatus('disconnected')
        setLspCapabilities([])
      }
    }
  }, [enableLSP, filePath, lang, workspaceRoot, connectLSP])

  useEffect(() => {
    if (!lspClientRef.current || !filePath || !lspConnected) return

    const uri = filePathToUri(filePath)
    lspClientRef.current.changeDocument(uri, content).catch((err) => {
      console.error('[CodeEditor] Failed to sync document:', err)
    })
  }, [content, filePath, lspConnected])

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden">
      {filePath && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-card border-b border-border">
          <span className="text-xs font-mono text-muted">{filePath}</span>
          {enableLSP && (
            <div className="flex items-center gap-2">
              <div className="group relative">
                <span className={`text-xs px-2 py-0.5 rounded cursor-help flex items-center gap-1 ${
                  lspStatus === 'connected' ? 'bg-green-500/20 text-green-500' :
                  lspStatus === 'connecting' ? 'bg-yellow-500/20 text-yellow-500' :
                  lspStatus === 'error' ? 'bg-red-500/20 text-red-500' :
                  'bg-muted text-muted-foreground'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    lspStatus === 'connected' ? 'bg-green-500' :
                    lspStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                    lspStatus === 'error' ? 'bg-red-500' :
                    'bg-muted-foreground'
                  }`} />
                  {lspStatus === 'connected' ? 'LSP' :
                   lspStatus === 'connecting' ? 'Connecting...' :
                   lspStatus === 'error' ? 'LSP Error' : 'LSP Off'}
                </span>
                <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block">
                  <div className="bg-popover border border-border rounded-md shadow-lg p-2 min-w-[200px] text-xs">
                    <div className="font-medium mb-1">Language Server Status</div>
                    {lspStatus === 'connected' && lspCapabilities.length > 0 && (
                      <div className="text-muted-foreground">
                        <div className="mb-1">Active features:</div>
                        <ul className="list-disc list-inside space-y-0.5">
                          {lspCapabilities.map((cap) => (
                            <li key={cap}>{cap}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {lspStatus === 'connecting' && (
                      <div className="text-muted-foreground">
                        Establishing connection to language server...
                      </div>
                    )}
                    {lspStatus === 'error' && lspError && (
                      <div className="text-red-400">
                        Error: {lspError}
                      </div>
                    )}
                    {lspStatus === 'disconnected' && (
                      <div className="text-muted-foreground">
                        LSP is disabled for this file type
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {lspStatus === 'error' && (
                <button
                  onClick={handleLSPReconnect}
                  className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={lang}
          value={content}
          theme={monacoTheme}
          onChange={handleChange}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          loading={<EditorLoading />}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            glyphMargin: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            bracketPairColorization: { enabled: true },
            padding: { top: 8 },
            smoothScrolling: true,
            tabSize: 2,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            automaticLayout: true,
            // LSP-like features
            quickSuggestions: {
              other: true,
              comments: true,
              strings: true,
            },
            suggestOnTriggerCharacters: true,
            parameterHints: { enabled: true },
            hover: { enabled: true, delay: 300 },
            definitionLinkOpensInPeek: false,
            // Additional IntelliSense options
            acceptSuggestionOnCommitCharacter: true,
            acceptSuggestionOnEnter: 'on',
            snippetSuggestions: 'inline',
            suggest: {
              localityBonus: true,
              shareSuggestSelections: true,
              showIcons: true,
              showStatusBar: true,
              preview: true,
              previewMode: 'subwordSmart',
              showMethods: true,
              showFunctions: true,
              showConstructors: true,
              showFields: true,
              showVariables: true,
              showClasses: true,
              showStructs: true,
              showInterfaces: true,
              showModules: true,
              showProperties: true,
              showEvents: true,
              showOperators: true,
              showUnits: true,
              showValues: true,
              showConstants: true,
              showEnums: true,
              showEnumMembers: true,
              showKeywords: true,
              showWords: true,
              showColors: true,
              showFiles: true,
              showReferences: true,
              showFolders: true,
              showTypeParameters: true,
              showSnippets: true,
            },
            // Code actions and quick fixes (lightbulb for quick fixes)
            // Folding
            folding: true,
            foldingStrategy: 'indentation',
            showFoldingControls: 'mouseover',
            // Inline hints
            inlayHints: { enabled: 'on' },
            // Go to definition on Ctrl+Click
            gotoLocation: {
              multiple: 'goto',
              multipleDefinitions: 'goto',
              multipleTypeDefinitions: 'goto',
              multipleDeclarations: 'goto',
              multipleImplementations: 'goto',
              multipleReferences: 'goto',
            },
          }}
        />
      </div>
    </div>
  )
}

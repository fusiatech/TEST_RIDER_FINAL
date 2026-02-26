'use client'

import { useTheme } from 'next-themes'
import Editor, { type OnChange } from '@monaco-editor/react'
import { Skeleton } from '@/components/ui/skeleton'

interface CodeEditorProps {
  filePath?: string
  content: string
  language?: string
  onChange?: (value: string) => void
  readOnly?: boolean
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
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme()
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light'
  const lang = language ?? (filePath ? detectLanguage(filePath) : 'plaintext')

  const handleChange: OnChange = (newValue) => {
    onChange?.(newValue ?? '')
  }

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden">
      {filePath && (
        <div className="flex items-center px-3 py-1.5 bg-card border-b border-border">
          <span className="text-xs font-mono text-muted">{filePath}</span>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={lang}
          value={content}
          theme={monacoTheme}
          onChange={handleChange}
          loading={<EditorLoading />}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            bracketPairColorization: { enabled: true },
            padding: { top: 8 },
            smoothScrolling: true,
            tabSize: 2,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  )
}

'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Figma,
  Plus,
  ExternalLink,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Code,
  Palette,
  RefreshCw,
  Copy,
  Check,
  Download,
  Eye,
  FileCode,
  Layers,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Search,
  Settings,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import type { FigmaLink, FigmaConfig } from '@/lib/types'
import { cn } from '@/lib/utils'

interface FigmaPanelProps {
  projectId?: string
  figmaLinks?: FigmaLink[]
  onAddLink?: (link: FigmaLink) => void
  onRemoveLink?: (id: string) => void
  figmaConfig?: FigmaConfig
  onConfigChange?: (config: FigmaConfig) => void
}

interface FigmaFile {
  key: string
  name: string
  lastModified: string
  thumbnailUrl: string
  version: string
}

interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
}

interface DesignToken {
  name: string
  value: string
  type: 'color' | 'spacing' | 'typography' | 'other'
  cssVar?: string
}

interface GeneratedCode {
  code: string
  language: string
  framework: string
  assets: Record<string, string>
}

type PanelTab = 'browser' | 'preview' | 'code' | 'tokens'

export function FigmaPanel({
  projectId,
  figmaLinks = [],
  onAddLink,
  onRemoveLink,
  figmaConfig,
  onConfigChange,
}: FigmaPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('browser')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<FigmaFile | null>(null)
  const [selectedNode, setSelectedNode] = useState<FigmaNode | null>(null)
  const [fileTree, setFileTree] = useState<FigmaNode[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [generatedCode, setGeneratedCode] = useState<GeneratedCode | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [designTokens, setDesignTokens] = useState<DesignToken[]>([])
  const [tokensLoading, setTokensLoading] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [accessToken, setAccessToken] = useState(figmaConfig?.accessToken || '')
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null)

  const isConfigured = Boolean(figmaConfig?.enabled && figmaConfig?.accessToken)

  const handleAddLink = useCallback(async () => {
    if (!url.trim()) return

    setLoading(true)
    try {
      const res = await fetch(`/api/figma?url=${encodeURIComponent(url)}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch Figma data')
      }

      const link: FigmaLink = {
        id: crypto.randomUUID(),
        url,
        fileKey: data.fileKey,
        nodeId: data.nodeId,
        name: data.name,
        thumbnailUrl: data.thumbnailUrl,
        lastModified: data.lastModified,
      }

      onAddLink?.(link)
      setUrl('')
      toast.success('Figma link added')

      setSelectedFile({
        key: data.fileKey,
        name: data.name,
        lastModified: data.lastModified,
        thumbnailUrl: data.thumbnailUrl,
        version: '',
      })
    } catch (err) {
      toast.error('Failed to add Figma link', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }, [url, onAddLink])

  const handleSelectLink = useCallback(async (link: FigmaLink) => {
    setSelectedFile({
      key: link.fileKey,
      name: link.name,
      lastModified: link.lastModified || '',
      thumbnailUrl: link.thumbnailUrl || '',
      version: '',
    })

    if (link.nodeId) {
      setSelectedNode({
        id: link.nodeId,
        name: link.name,
        type: 'FRAME',
      })
      loadPreview(link.fileKey, link.nodeId)
    }
  }, [])

  const loadPreview = useCallback(async (fileKey: string, nodeId: string) => {
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/figma/preview?fileKey=${fileKey}&nodeId=${encodeURIComponent(nodeId)}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load preview')
      }

      setPreviewUrl(data.imageUrl)
    } catch (err) {
      toast.error('Failed to load preview', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  const loadDesignContext = useCallback(async (fileKey: string, nodeId: string) => {
    setCodeLoading(true)
    try {
      const res = await fetch('/api/figma/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileKey,
          nodeId,
          clientLanguages: 'typescript',
          clientFrameworks: 'react',
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate code')
      }

      setGeneratedCode({
        code: data.code,
        language: 'typescript',
        framework: 'react',
        assets: data.assets || {},
      })
      setActiveTab('code')
    } catch (err) {
      toast.error('Failed to generate code', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setCodeLoading(false)
    }
  }, [])

  const loadDesignTokens = useCallback(async (fileKey: string, nodeId: string) => {
    setTokensLoading(true)
    try {
      const res = await fetch('/api/figma/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileKey, nodeId }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract tokens')
      }

      setDesignTokens(data.tokens || [])
      setActiveTab('tokens')
    } catch (err) {
      toast.error('Failed to extract design tokens', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setTokensLoading(false)
    }
  }, [])

  const handleCopyCode = useCallback(() => {
    if (!generatedCode?.code) return
    navigator.clipboard.writeText(generatedCode.code)
    setCopied(true)
    toast.success('Code copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }, [generatedCode])

  const handleTestConnection = useCallback(async () => {
    if (!accessToken.trim()) return

    setTestingConnection(true)
    setConnectionStatus(null)
    try {
      const res = await fetch('/api/figma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', accessToken }),
      })
      const data = await res.json()
      setConnectionStatus(data)

      if (data.success) {
        toast.success('Figma connection successful')
      } else {
        toast.error('Connection failed', { description: data.message })
      }
    } catch (err) {
      setConnectionStatus({
        success: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      })
    } finally {
      setTestingConnection(false)
    }
  }, [accessToken])

  const handleSaveConfig = useCallback(() => {
    onConfigChange?.({
      enabled: true,
      accessToken,
      teamId: figmaConfig?.teamId,
    })
    setConfigOpen(false)
    toast.success('Figma configuration saved')
  }, [accessToken, figmaConfig?.teamId, onConfigChange])

  const toggleNodeExpanded = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const filteredLinks = useMemo(() => {
    if (!searchQuery.trim()) return figmaLinks
    const query = searchQuery.toLowerCase()
    return figmaLinks.filter(
      (link) =>
        link.name.toLowerCase().includes(query) ||
        link.url.toLowerCase().includes(query)
    )
  }, [figmaLinks, searchQuery])

  const tokensByType = useMemo(() => {
    const grouped: Record<string, DesignToken[]> = {
      color: [],
      spacing: [],
      typography: [],
      other: [],
    }
    designTokens.forEach((token) => {
      grouped[token.type].push(token)
    })
    return grouped
  }, [designTokens])

  const exportTokensAsCSS = useCallback(() => {
    const cssVars = designTokens
      .filter((t) => t.cssVar)
      .map((t) => `  ${t.cssVar}: ${t.value};`)
      .join('\n')
    const css = `:root {\n${cssVars}\n}`
    navigator.clipboard.writeText(css)
    toast.success('CSS variables copied to clipboard')
  }, [designTokens])

  if (!isConfigured && !configOpen) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Figma className="h-12 w-12 text-muted mb-4" />
          <h3 className="text-lg font-medium mb-2">Figma Integration</h3>
          <p className="text-sm text-muted text-center mb-4 max-w-sm">
            Connect your Figma account to browse designs, preview frames, and export code.
          </p>
          <Button onClick={() => setConfigOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Configure Figma
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (configOpen) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Figma className="h-5 w-5" />
            Figma Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Access Token</label>
            <Input
              type="password"
              placeholder="Enter your Figma personal access token"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <p className="text-xs text-muted">
              Generate a token at{' '}
              <a
                href="https://www.figma.com/developers/api#access-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Figma Settings → Personal Access Tokens
              </a>
            </p>
          </div>

          {connectionStatus && (
            <div
              className={cn(
                'flex items-center gap-2 p-3 rounded-md text-sm',
                connectionStatus.success
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-red-500/10 text-red-500'
              )}
            >
              {connectionStatus.success ? (
                <Check className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {connectionStatus.message}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={!accessToken.trim() || testingConnection}
            >
              {testingConnection ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
            <Button
              onClick={handleSaveConfig}
              disabled={!accessToken.trim() || !connectionStatus?.success}
            >
              Save Configuration
            </Button>
            <Button variant="ghost" onClick={() => setConfigOpen(false)}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PanelTab)} className="flex-1 flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <TabsList>
            <TabsTrigger value="browser" className="gap-1.5">
              <FolderOpen className="h-4 w-4" />
              Browser
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-1.5">
              <Eye className="h-4 w-4" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-1.5">
              <Code className="h-4 w-4" />
              Code
            </TabsTrigger>
            <TabsTrigger value="tokens" className="gap-1.5">
              <Palette className="h-4 w-4" />
              Tokens
            </TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="sm" onClick={() => setConfigOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        <TabsContent value="browser" className="flex-1 p-4 overflow-auto">
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Paste Figma URL..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                disabled={loading}
                className="flex-1"
              />
              <Button onClick={handleAddLink} disabled={loading || !url.trim()}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <Input
                placeholder="Search linked designs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {filteredLinks.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <Figma className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium">No Figma designs linked</p>
                <p className="text-xs mt-1">Paste a Figma URL above to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLinks.map((link) => (
                  <Card
                    key={link.id}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-secondary/50',
                      selectedFile?.key === link.fileKey && 'ring-2 ring-primary'
                    )}
                    onClick={() => handleSelectLink(link)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        {link.thumbnailUrl ? (
                          <img
                            src={link.thumbnailUrl}
                            alt={link.name}
                            className="w-20 h-14 object-cover rounded border border-border"
                          />
                        ) : (
                          <div className="w-20 h-14 rounded border border-border bg-secondary/50 flex items-center justify-center">
                            <ImageIcon className="h-6 w-6 text-muted" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Figma className="h-4 w-4 text-purple-500 shrink-0" />
                            <span className="text-sm font-medium truncate">{link.name}</span>
                          </div>
                          {link.lastModified && (
                            <p className="text-xs text-muted mt-0.5">
                              Modified {new Date(link.lastModified).toLocaleDateString()}
                            </p>
                          )}
                          {link.nodeId && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              Node: {link.nodeId}
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                            <a href={link.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                          {onRemoveLink && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-400"
                              onClick={(e) => {
                                e.stopPropagation()
                                onRemoveLink(link.id)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="preview" className="flex-1 p-4 overflow-auto">
          {!selectedFile ? (
            <div className="flex flex-col items-center justify-center h-full text-muted">
              <Eye className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">Select a design to preview</p>
            </div>
          ) : previewLoading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Spinner className="h-8 w-8 mb-3" />
              <p className="text-sm text-muted">Loading preview...</p>
            </div>
          ) : previewUrl ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{selectedFile.name}</h3>
                  {selectedNode && (
                    <p className="text-sm text-muted">Node: {selectedNode.name}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectedNode && loadDesignContext(selectedFile.key, selectedNode.id)}
                    disabled={!selectedNode || codeLoading}
                  >
                    {codeLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Generate Code
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectedNode && loadDesignTokens(selectedFile.key, selectedNode.id)}
                    disabled={!selectedNode || tokensLoading}
                  >
                    {tokensLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Palette className="h-4 w-4 mr-2" />
                    )}
                    Extract Tokens
                  </Button>
                </div>
              </div>
              <div className="border border-border rounded-lg overflow-hidden bg-[#1e1e1e]">
                <img
                  src={previewUrl}
                  alt={selectedFile.name}
                  className="max-w-full h-auto mx-auto"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted">
              <ImageIcon className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">No preview available</p>
              <p className="text-xs mt-1">Select a specific node to preview</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="code" className="flex-1 p-4 overflow-auto">
          {!generatedCode ? (
            <div className="flex flex-col items-center justify-center h-full text-muted">
              <Code className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">No code generated yet</p>
              <p className="text-xs mt-1">Select a design and click &quot;Generate Code&quot;</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{generatedCode.language}</Badge>
                  <Badge variant="outline">{generatedCode.framework}</Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyCode}>
                    {copied ? (
                      <Check className="h-4 w-4 mr-2" />
                    ) : (
                      <Copy className="h-4 w-4 mr-2" />
                    )}
                    {copied ? 'Copied!' : 'Copy Code'}
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-secondary/50 px-4 py-2 border-b border-border flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-muted" />
                  <span className="text-sm font-mono">Component.tsx</span>
                </div>
                <pre className="p-4 overflow-auto bg-[#1e1e1e] text-sm">
                  <code className="text-[#d4d4d4] font-mono whitespace-pre-wrap">
                    {generatedCode.code}
                  </code>
                </pre>
              </div>

              {Object.keys(generatedCode.assets).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Assets</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(generatedCode.assets).map(([name, url]) => (
                      <Card key={name} className="p-2">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="h-4 w-4 text-muted shrink-0" />
                          <span className="text-xs truncate flex-1">{name}</span>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild>
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              <Download className="h-3 w-3" />
                            </a>
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tokens" className="flex-1 p-4 overflow-auto">
          {designTokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted">
              <Palette className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">No design tokens extracted</p>
              <p className="text-xs mt-1">Select a design and click &quot;Extract Tokens&quot;</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Design Tokens ({designTokens.length})</h3>
                <Button variant="outline" size="sm" onClick={exportTokensAsCSS}>
                  <Copy className="h-4 w-4 mr-2" />
                  Export as CSS
                </Button>
              </div>

              {tokensByType.color.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-linear-to-r from-red-500 via-green-500 to-blue-500" />
                    Colors ({tokensByType.color.length})
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {tokensByType.color.map((token) => (
                      <Card key={token.name} className="p-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded border border-border shrink-0"
                            style={{ backgroundColor: token.value }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{token.name}</p>
                            <p className="text-xs text-muted font-mono">{token.value}</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {tokensByType.spacing.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Spacing ({tokensByType.spacing.length})</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {tokensByType.spacing.map((token) => (
                      <Card key={token.name} className="p-3">
                        <p className="text-sm font-medium truncate">{token.name}</p>
                        <p className="text-xs text-muted font-mono">{token.value}</p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {tokensByType.typography.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Typography ({tokensByType.typography.length})</h4>
                  <div className="space-y-2">
                    {tokensByType.typography.map((token) => (
                      <Card key={token.name} className="p-3">
                        <p className="text-sm font-medium">{token.name}</p>
                        <p className="text-xs text-muted font-mono">{token.value}</p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {tokensByType.other.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Other ({tokensByType.other.length})</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {tokensByType.other.map((token) => (
                      <Card key={token.name} className="p-3">
                        <p className="text-sm font-medium truncate">{token.name}</p>
                        <p className="text-xs text-muted font-mono">{token.value}</p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

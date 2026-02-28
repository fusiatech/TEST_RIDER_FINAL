'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type RuleApplicability = 'always' | 'manual' | 'model_decision' | 'file_pattern' | 'off'

interface RuleItem {
  id: string
  name: string
  description: string
  applicability: RuleApplicability
  enabled: boolean
  filePattern?: string
  modelIds?: string[]
  projectIds?: string[]
  updatedAt: number
}

const APPLICABILITY_LABELS: Record<RuleApplicability, string> = {
  always: 'Always',
  manual: 'Manual only',
  model_decision: 'Model decision',
  file_pattern: 'By file pattern',
  off: 'Off',
}

interface RulesEngineSettingsProps {
  canConfigureSettings: boolean
}

export function RulesEngineSettings({ canConfigureSettings }: RulesEngineSettingsProps) {
  const [rules, setRules] = useState<RuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const hasChanges = useMemo(() => rules.length > 0, [rules])

  const loadRules = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/rules')
      if (!response.ok) {
        throw new Error('Failed to load rules')
      }
      const payload = (await response.json()) as { rules?: RuleItem[] }
      setRules(payload.rules ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load rules')
      setRules([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  const updateRule = (ruleId: string, patch: Partial<RuleItem>) => {
    setRules((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule))
    )
  }

  const saveRules = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error((payload as { error?: string } | null)?.error ?? 'Failed to save rules')
      }
      const payload = (await response.json()) as { rules?: RuleItem[] }
      setRules(payload.rules ?? [])
      toast.success('Rules engine updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save rules')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Prompt Library Rules Engine</h3>
          <p className="text-xs text-muted">
            Configure when prompt rules apply: always, manual, model decision, file pattern, or off.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void loadRules()}
          disabled={loading || saving}
        >
          {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-background/50 px-3 py-2 text-xs text-muted">
          Loading rules...
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-border bg-background/50 px-3 py-2 text-xs text-muted">
          No rules configured yet.
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-border/70 bg-background/50 p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{rule.name}</p>
                  <p className="text-xs text-muted">{rule.description}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {new Date(rule.updatedAt).toLocaleDateString()}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
                <label className="text-xs text-muted">
                  Applicability
                  <select
                    value={rule.applicability}
                    onChange={(event) =>
                      updateRule(rule.id, { applicability: event.target.value as RuleApplicability })
                    }
                    disabled={!canConfigureSettings}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {Object.entries(APPLICABILITY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-muted">
                  File pattern (optional)
                  <Input
                    value={rule.filePattern ?? ''}
                    onChange={(event) => updateRule(rule.id, { filePattern: event.target.value })}
                    disabled={!canConfigureSettings || rule.applicability !== 'file_pattern'}
                    className="mt-1"
                    placeholder="src/**/*.ts"
                  />
                </label>

                <div className="flex items-center justify-between gap-3 rounded-md border border-border px-2 py-2">
                  <span className="text-xs text-muted">Enabled</span>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(value) => updateRule(rule.id, { enabled: value })}
                    disabled={!canConfigureSettings}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() => void saveRules()}
          disabled={!canConfigureSettings || !hasChanges || saving}
        >
          {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Save Rules
        </Button>
      </div>
    </div>
  )
}


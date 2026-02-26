'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSwarmStore } from '@/lib/store'
import { Cpu, HardDrive, Terminal, Settings, ExternalLink } from 'lucide-react'

interface HealthData {
  disk: { used: number; total: number; unit: string }
  memory: { used: number; total: number; unit: string }
  cliStatus: string
}

export function EclipseDashboard() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const toggleSettings = useSwarmStore((s) => s.toggleSettings)

  useEffect(() => {
    fetch('/api/eclipse/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { setHealth(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Eclipse Dashboard</h2>
        <p className="text-sm text-muted mt-1">Workspace health and tooling</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" />
              Disk
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted">Loading…</p> : health?.disk ? (
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (health.disk.used / Math.max(1, health.disk.total)) * 100)}%` }} />
                </div>
                <span className="text-xs text-muted">{health.disk.used} / {health.disk.total} {health.disk.unit}</span>
              </div>
            ) : <p className="text-sm text-muted">N/A (API not available)</p>}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              Memory
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted">Loading…</p> : health?.memory ? (
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (health.memory.used / Math.max(1, health.memory.total)) * 100)}%` }} />
                </div>
                <span className="text-xs text-muted">{health.memory.used} / {health.memory.total} {health.memory.unit}</span>
              </div>
            ) : <p className="text-sm text-muted">N/A (API not available)</p>}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              CLI Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted">Loading…</p> : health?.cliStatus ? (
              <Badge variant="outline" className={health.cliStatus === 'ok' ? 'text-green-500 border-green-500/30' : 'text-yellow-500 border-yellow-500/30'}>{health.cliStatus}</Badge>
            ) : <p className="text-sm text-muted">N/A</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Tooling & Guardrail Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" className="gap-2" onClick={toggleSettings}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  XCircle,
  Cpu,
  HardDrive,
  RefreshCw,
  Clock,
  Zap,
  Bot,
  Loader2,
  CheckCircle,
  Wifi,
  WifiOff,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart as PieChartIcon,
  Server,
  Database,
  Globe,
  AlertCircle,
  Timer,
  Gauge,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react'

interface TimeSeriesPoint {
  timestamp: number
  value: number
}

interface DashboardMetrics {
  timestamp: string
  system: {
    uptime: number
    cpuUsage: number
    memoryUsage: {
      heapUsed: number
      heapTotal: number
      rss: number
      external: number
      heapUsagePercent: number
    }
    systemMemory: {
      usagePercent: number
      freeMemMB: number
      totalMemMB: number
    }
    eventLoopLatency: number
  }
  requests: {
    total: number
    ratePerMinute: number
    avgLatencyMs: number
    p50LatencyMs: number
    p95LatencyMs: number
    p99LatencyMs: number
    byStatus: Record<string, number>
    byMethod: Record<string, number>
  }
  errors: {
    total: number
    ratePerMinute: number
    byType: Record<string, number>
    recent: Array<{
      timestamp: number
      type: string
      message: string
      path?: string
    }>
  }
  websocket: {
    activeConnections: number
    messagesPerMinute: number
    avgMessageSize: number
  }
  jobs: {
    active: number
    queued: number
    completed: number
    failed: number
    avgDurationMs: number
    throughputPerHour: number
  }
  agents: {
    installed: Array<{ id: string; installed: boolean; name: string }>
    spawnsTotal: number
    failuresTotal: number
    avgResponseTimeMs: number
    byProvider: Record<string, { spawns: number; failures: number; avgTime: number }>
  }
  cache: {
    hits: number
    misses: number
    hitRate: number
    size: number
    maxSize: number
  }
  rateLimit: {
    totalRequests: number
    throttledRequests: number
    throttleRate: number
  }
  pipeline: {
    runsTotal: number
    lastRunTime: number | null
    avgConfidenceScore: number
    byMode: Record<string, { runs: number; avgConfidence: number }>
  }
  timeSeries: {
    requestRate: TimeSeriesPoint[]
    errorRate: TimeSeriesPoint[]
    latency: TimeSeriesPoint[]
    memoryUsage: TimeSeriesPoint[]
    jobThroughput: TimeSeriesPoint[]
  }
}

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'loading'

const CHART_COLORS = {
  primary: '#6366f1',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
  cyan: '#06b6d4',
}

const STATUS_COLORS: Record<string, string> = {
  '2xx': CHART_COLORS.success,
  '3xx': CHART_COLORS.info,
  '4xx': CHART_COLORS.warning,
  '5xx': CHART_COLORS.error,
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous
  const percentChange = previous !== 0 ? ((diff / previous) * 100) : 0
  
  if (Math.abs(percentChange) < 1) {
    return (
      <span className="flex items-center text-muted text-xs">
        <Minus className="h-3 w-3 mr-1" />
        Stable
      </span>
    )
  }
  
  const isUp = diff > 0
  return (
    <span className={`flex items-center text-xs ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
      {isUp ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
      {Math.abs(percentChange).toFixed(1)}%
    </span>
  )
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  status,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  trend?: { current: number; previous: number }
  status?: 'success' | 'warning' | 'error' | 'info'
}) {
  const statusColors = {
    success: 'text-emerald-500 bg-emerald-500/10',
    warning: 'text-amber-500 bg-amber-500/10',
    error: 'text-rose-500 bg-rose-500/10',
    info: 'text-blue-500 bg-blue-500/10',
  }
  
  const iconStyle = status ? statusColors[status] : 'text-primary bg-primary/10'
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl p-4 hover:shadow-lg transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${iconStyle}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && <TrendIndicator current={trend.current} previous={trend.previous} />}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm font-medium text-foreground mt-1">{title}</p>
        {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
      </div>
    </motion.div>
  )
}

function StatusBadge({ status }: { status: HealthStatus }) {
  const config = {
    healthy: {
      icon: CheckCircle,
      label: 'Healthy',
      className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    },
    degraded: {
      icon: AlertTriangle,
      label: 'Degraded',
      className: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    },
    unhealthy: {
      icon: XCircle,
      label: 'Unhealthy',
      className: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    },
    loading: {
      icon: Loader2,
      label: 'Loading',
      className: 'bg-muted/10 text-muted border-border',
    },
  }
  
  const { icon: Icon, label, className } = config[status]
  
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${className}`}>
      <Icon className={`h-4 w-4 ${status === 'loading' ? 'animate-spin' : ''}`} />
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

function LatencyChart({ data }: { data: TimeSeriesPoint[] }) {
  const chartData = data.map(point => ({
    time: formatTime(point.timestamp),
    latency: point.value,
  }))
  
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="time" stroke="var(--muted)" fontSize={12} />
        <YAxis stroke="var(--muted)" fontSize={12} tickFormatter={(v) => `${v}ms`} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
          labelStyle={{ color: 'var(--foreground)' }}
        />
        <Area
          type="monotone"
          dataKey="latency"
          stroke={CHART_COLORS.primary}
          fill="url(#latencyGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function RequestRateChart({ data }: { data: TimeSeriesPoint[] }) {
  const chartData = data.map(point => ({
    time: formatTime(point.timestamp),
    requests: point.value,
  }))
  
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="time" stroke="var(--muted)" fontSize={12} />
        <YAxis stroke="var(--muted)" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
          labelStyle={{ color: 'var(--foreground)' }}
        />
        <Line
          type="monotone"
          dataKey="requests"
          stroke={CHART_COLORS.success}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function ErrorRateChart({ data }: { data: TimeSeriesPoint[] }) {
  const chartData = data.map(point => ({
    time: formatTime(point.timestamp),
    errors: point.value,
  }))
  
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="time" stroke="var(--muted)" fontSize={12} />
        <YAxis stroke="var(--muted)" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
          labelStyle={{ color: 'var(--foreground)' }}
        />
        <Bar dataKey="errors" fill={CHART_COLORS.error} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function StatusDistributionChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data).map(([status, count]) => ({
    name: status,
    value: count,
    color: STATUS_COLORS[status] || CHART_COLORS.info,
  }))
  
  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted">
        No data available
      </div>
    )
  }
  
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}

function MemoryGauge({ used, total }: { used: number; total: number }) {
  const percentage = total > 0 ? (used / total) * 100 : 0
  const color = percentage > 90 ? CHART_COLORS.error : percentage > 70 ? CHART_COLORS.warning : CHART_COLORS.success
  
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={[
              { value: percentage, color },
              { value: 100 - percentage, color: 'var(--secondary)' },
            ]}
            cx="50%"
            cy="50%"
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={80}
            dataKey="value"
          >
            <Cell fill={color} />
            <Cell fill="var(--secondary)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
        <span className="text-3xl font-bold text-foreground">{percentage.toFixed(1)}%</span>
        <span className="text-sm text-muted">Memory Used</span>
      </div>
    </div>
  )
}

function AgentStatusGrid({ agents }: { agents: Array<{ id: string; installed: boolean; name: string }> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {agents.map((agent) => (
        <motion.div
          key={agent.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`
            flex items-center gap-3 p-3 rounded-lg border transition-all
            ${agent.installed 
              ? 'bg-emerald-500/5 border-emerald-500/20' 
              : 'bg-secondary/30 border-border opacity-60'}
          `}
        >
          <div className={`
            p-2 rounded-lg
            ${agent.installed ? 'bg-emerald-500/10' : 'bg-secondary'}
          `}>
            <Bot className={`h-4 w-4 ${agent.installed ? 'text-emerald-500' : 'text-muted'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
            <p className={`text-xs ${agent.installed ? 'text-emerald-500' : 'text-muted'}`}>
              {agent.installed ? 'Online' : 'Offline'}
            </p>
          </div>
          <div className={`
            w-2 h-2 rounded-full
            ${agent.installed ? 'bg-emerald-500 animate-pulse' : 'bg-muted'}
          `} />
        </motion.div>
      ))}
    </div>
  )
}

function RecentErrorsList({ errors }: { errors: Array<{ timestamp: number; type: string; message: string; path?: string }> }) {
  if (errors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted">
        <CheckCircle className="h-10 w-10 mb-2 text-emerald-500/50" />
        <p className="text-sm">No recent errors</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto">
      {errors.map((error, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
          className="flex items-start gap-3 p-3 rounded-lg bg-rose-500/5 border border-rose-500/10"
        >
          <AlertCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-rose-500">{error.type}</span>
              {error.path && (
                <span className="text-xs text-muted truncate">{error.path}</span>
              )}
            </div>
            <p className="text-sm text-foreground mt-1 line-clamp-2">{error.message}</p>
            <p className="text-xs text-muted mt-1">
              {new Date(error.timestamp).toLocaleString()}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

export function ObservabilityDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  
  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/metrics/dashboard')
      if (res.ok) {
        const data = await res.json()
        setMetrics(data)
        setLastUpdated(new Date())
      }
    } catch {
      // API may not be available
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])
  
  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])
  
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchMetrics, 15000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchMetrics])
  
  const handleRefresh = () => {
    setRefreshing(true)
    fetchMetrics()
  }

  const memoryUsage = metrics?.system?.memoryUsage ?? {
    heapUsed: 0,
    heapTotal: 0,
    rss: 0,
    external: 0,
    heapUsagePercent: 0,
  }

  const systemMemory = metrics?.system?.systemMemory ?? {
    usagePercent: 0,
    freeMemMB: 0,
    totalMemMB: 0,
  }
  
  const getHealthStatus = (): HealthStatus => {
    if (loading || !metrics) return 'loading'
    
    const memPercent = memoryUsage.heapUsagePercent
    const errorRate = metrics.errors.ratePerMinute
    const eventLoopLatency = metrics.system.eventLoopLatency
    
    if (memPercent > 90 || errorRate > 10 || eventLoopLatency > 200) return 'unhealthy'
    if (memPercent > 70 || errorRate > 5 || eventLoopLatency > 100) return 'degraded'
    return 'healthy'
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="h-12 w-12 text-primary" />
        </motion.div>
      </div>
    )
  }
  
  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            Observability Dashboard
          </h1>
          <p className="text-muted mt-1">
            Real-time system metrics and performance monitoring
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={getHealthStatus()} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'border-emerald-500/50' : ''}
          >
            {autoRefresh ? (
              <Wifi className="h-4 w-4 text-emerald-500" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </motion.div>
      
      {lastUpdated && (
        <p className="text-xs text-muted">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
      
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <MetricCard
          title="Uptime"
          value={metrics ? formatDuration(metrics.system.uptime) : '-'}
          subtitle="System running time"
          icon={Clock}
          status="success"
        />
        <MetricCard
          title="Memory Usage"
          value={`${memoryUsage.heapUsagePercent.toFixed(1)}%`}
          subtitle={metrics ? formatBytes(memoryUsage.heapUsed) : '-'}
          icon={Cpu}
          status={
            memoryUsage.heapUsagePercent > 90 ? 'error' :
            memoryUsage.heapUsagePercent > 70 ? 'warning' : 'success'
          }
        />
        <MetricCard
          title="Request Rate"
          value={`${metrics?.requests.ratePerMinute || 0}/min`}
          subtitle="Requests per minute"
          icon={Activity}
          status="info"
        />
        <MetricCard
          title="Avg Latency"
          value={`${metrics?.requests.avgLatencyMs || 0}ms`}
          subtitle={`P95: ${metrics?.requests.p95LatencyMs || 0}ms`}
          icon={Timer}
          status={
            (metrics?.requests.avgLatencyMs || 0) > 500 ? 'error' :
            (metrics?.requests.avgLatencyMs || 0) > 200 ? 'warning' : 'success'
          }
        />
        <MetricCard
          title="Error Rate"
          value={`${metrics?.errors.ratePerMinute || 0}/min`}
          subtitle={`Total: ${metrics?.errors.total || 0}`}
          icon={AlertTriangle}
          status={(metrics?.errors.ratePerMinute || 0) > 0 ? 'error' : 'success'}
        />
        <MetricCard
          title="WS Connections"
          value={metrics?.websocket.activeConnections || 0}
          subtitle="Active connections"
          icon={Globe}
          status="info"
        />
      </div>
      
      {/* Tabs for different views */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview" className="gap-2">
            <Gauge className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Requests</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2">
            <Server className="h-4 w-4" />
            <span className="hidden sm:inline">System</span>
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-2">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Agents</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Request Rate Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Request Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics && <RequestRateChart data={metrics.timeSeries.requestRate} />}
              </CardContent>
            </Card>
            
            {/* Latency Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Timer className="h-5 w-5 text-primary" />
                  Response Latency
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics && <LatencyChart data={metrics.timeSeries.latency} />}
              </CardContent>
            </Card>
            
            {/* Error Rate Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-500" />
                  Error Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics && <ErrorRateChart data={metrics.timeSeries.errorRate} />}
              </CardContent>
            </Card>
            
            {/* Status Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5 text-primary" />
                  Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics && <StatusDistributionChart data={metrics.requests.byStatus} />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="requests" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              title="Total Requests"
              value={metrics?.requests.total || 0}
              icon={Activity}
              status="info"
            />
            <MetricCard
              title="P50 Latency"
              value={`${metrics?.requests.p50LatencyMs || 0}ms`}
              icon={Timer}
              status="success"
            />
            <MetricCard
              title="P99 Latency"
              value={`${metrics?.requests.p99LatencyMs || 0}ms`}
              icon={Timer}
              status={(metrics?.requests.p99LatencyMs || 0) > 1000 ? 'warning' : 'success'}
            />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Request Rate Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics && <RequestRateChart data={metrics.timeSeries.requestRate} />}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Latency Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics && <LatencyChart data={metrics.timeSeries.latency} />}
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-rose-500" />
                Recent Errors
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metrics && <RecentErrorsList errors={metrics.errors.recent} />}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="system" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Heap Used"
              value={metrics ? formatBytes(memoryUsage.heapUsed) : '-'}
              subtitle={`of ${metrics ? formatBytes(memoryUsage.heapTotal) : '-'}`}
              icon={Database}
              status={
                memoryUsage.heapUsagePercent > 90 ? 'error' :
                memoryUsage.heapUsagePercent > 70 ? 'warning' : 'success'
              }
            />
            <MetricCard
              title="RSS Memory"
              value={metrics ? formatBytes(memoryUsage.rss) : '-'}
              subtitle="Resident Set Size"
              icon={HardDrive}
            />
            <MetricCard
              title="Event Loop"
              value={`${metrics?.system.eventLoopLatency || 0}ms`}
              subtitle="Latency"
              icon={Zap}
              status={
                (metrics?.system.eventLoopLatency || 0) > 200 ? 'error' :
                (metrics?.system.eventLoopLatency || 0) > 100 ? 'warning' : 'success'
              }
            />
            <MetricCard
              title="System Memory"
              value={`${systemMemory.usagePercent.toFixed(1)}%`}
              subtitle={`${systemMemory.freeMemMB.toFixed(0)} MB free`}
              icon={Server}
              status={
                systemMemory.usagePercent > 90 ? 'error' :
                systemMemory.usagePercent > 70 ? 'warning' : 'success'
              }
            />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Memory Usage</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics && (
                  <MemoryGauge
                    used={memoryUsage.heapUsed}
                    total={memoryUsage.heapTotal}
                  />
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Cache Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted">Hit Rate</span>
                    <span className="text-lg font-bold text-foreground">
                      {metrics?.cache.hitRate || 0}%
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      className="h-full bg-emerald-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${metrics?.cache.hitRate || 0}%` }}
                      transition={{ duration: 1 }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="text-center p-3 rounded-lg bg-emerald-500/10">
                      <p className="text-2xl font-bold text-emerald-500">{metrics?.cache.hits || 0}</p>
                      <p className="text-xs text-muted">Cache Hits</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-rose-500/10">
                      <p className="text-2xl font-bold text-rose-500">{metrics?.cache.misses || 0}</p>
                      <p className="text-xs text-muted">Cache Misses</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Job Queue Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-3xl font-bold text-blue-500">{metrics?.jobs.active || 0}</p>
                  <p className="text-sm text-muted mt-1">Active Jobs</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-3xl font-bold text-amber-500">{metrics?.jobs.queued || 0}</p>
                  <p className="text-sm text-muted mt-1">Queued Jobs</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-3xl font-bold text-emerald-500">{metrics?.jobs.completed || 0}</p>
                  <p className="text-sm text-muted mt-1">Completed</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-rose-500/10 border border-rose-500/20">
                  <p className="text-3xl font-bold text-rose-500">{metrics?.jobs.failed || 0}</p>
                  <p className="text-sm text-muted mt-1">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="agents" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              title="Total Spawns"
              value={metrics?.agents.spawnsTotal || 0}
              subtitle="Agent instances created"
              icon={Bot}
              status="info"
            />
            <MetricCard
              title="Failures"
              value={metrics?.agents.failuresTotal || 0}
              subtitle="Agent failures"
              icon={XCircle}
              status={(metrics?.agents.failuresTotal || 0) > 0 ? 'error' : 'success'}
            />
            <MetricCard
              title="Success Rate"
              value={
                metrics && metrics.agents.spawnsTotal > 0
                  ? `${(((metrics.agents.spawnsTotal - metrics.agents.failuresTotal) / metrics.agents.spawnsTotal) * 100).toFixed(1)}%`
                  : '100%'
              }
              subtitle="Agent success rate"
              icon={CheckCircle}
              status="success"
            />
          </div>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                CLI Agent Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metrics && <AgentStatusGrid agents={metrics.agents.installed} />}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Pipeline Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-3xl font-bold text-primary">{metrics?.pipeline.runsTotal || 0}</p>
                  <p className="text-sm text-muted mt-1">Total Runs</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-3xl font-bold text-emerald-500">
                    {metrics?.pipeline.avgConfidenceScore.toFixed(0) || 0}%
                  </p>
                  <p className="text-sm text-muted mt-1">Avg Confidence</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-3xl font-bold text-blue-500">
                    {metrics?.pipeline.lastRunTime 
                      ? new Date(metrics.pipeline.lastRunTime).toLocaleTimeString()
                      : '-'}
                  </p>
                  <p className="text-sm text-muted mt-1">Last Run</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSwarmStore } from '@/lib/store'
import { normalizeHealthData, type HealthViewData } from '@/lib/health-view'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  XCircle,
  Cpu,
  HardDrive,
  RefreshCw,
  FileText,
  Settings,
  Bot,
  Clock,
  Zap,
  Search,
  Code,
  CheckSquare,
  Sparkles,
  Timer,
  ListTodo,
  Loader2,
  Heart,
  Rocket,
  Coffee,
  Star,
  ThumbsUp,
  PartyPopper,
  Gauge,
  CircleDot,
  Info,
} from 'lucide-react'

type HealthData = HealthViewData

interface ActivityEvent {
  id: string
  type: 'job_started' | 'job_completed' | 'job_failed' | 'agent_spawned' | 'system'
  message: string
  timestamp: number
  icon: 'play' | 'check' | 'error' | 'bot' | 'info'
}

type HealthStatus = 'healthy' | 'warning' | 'critical' | 'loading'

function ProgressRing({ 
  progress, 
  size = 120, 
  strokeWidth = 10,
  color = 'primary',
  showPercentage = true,
  label,
  icon: Icon,
  friendlyLabel,
}: { 
  progress: number
  size?: number
  strokeWidth?: number
  color?: 'primary' | 'green' | 'yellow' | 'red' | 'blue'
  showPercentage?: boolean
  label?: string
  icon?: React.ElementType
  friendlyLabel?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  const colorClasses = {
    primary: 'stroke-primary',
    green: 'stroke-emerald-500',
    yellow: 'stroke-amber-500',
    red: 'stroke-rose-500',
    blue: 'stroke-blue-500',
  }

  const bgColorClasses = {
    primary: 'text-primary/10',
    green: 'text-emerald-500/10',
    yellow: 'text-amber-500/10',
    red: 'text-rose-500/10',
    blue: 'text-blue-500/10',
  }

  return (
    <motion.div 
      className="relative inline-flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="relative">
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            className={bgColorClasses[color]}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            fill="none"
            className={colorClasses[color]}
            strokeLinecap="round"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
            style={{
              strokeDasharray: circumference,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {Icon && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Icon className={`h-6 w-6 mb-1 ${
                color === 'green' ? 'text-emerald-500' :
                color === 'yellow' ? 'text-amber-500' :
                color === 'red' ? 'text-rose-500' :
                color === 'blue' ? 'text-blue-500' :
                'text-primary'
              }`} />
            </motion.div>
          )}
          {showPercentage && (
            <motion.span 
              className="text-2xl font-bold text-foreground"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8 }}
            >
              {Math.round(progress)}%
            </motion.span>
          )}
        </div>
      </div>
      {label && (
        <motion.span 
          className="text-sm font-medium text-foreground mt-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          {label}
        </motion.span>
      )}
      {friendlyLabel && (
        <motion.span 
          className="text-xs text-muted mt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
        >
          {friendlyLabel}
        </motion.span>
      )}
    </motion.div>
  )
}

function HeroStatusCard({ status, uptime, activeJobs }: { 
  status: HealthStatus
  uptime?: number
  activeJobs?: number
}) {
  const config = {
    healthy: {
      icon: Heart,
      gradient: 'from-emerald-500/20 via-emerald-500/10 to-transparent',
      borderColor: 'border-emerald-500/30',
      iconColor: 'text-emerald-500',
      iconBg: 'bg-emerald-500/20',
      title: 'All Systems Go!',
      subtitle: "Everything is running smoothly. You're all set!",
      emoji: '✨',
    },
    warning: {
      icon: AlertTriangle,
      gradient: 'from-amber-500/20 via-amber-500/10 to-transparent',
      borderColor: 'border-amber-500/30',
      iconColor: 'text-amber-500',
      iconBg: 'bg-amber-500/20',
      title: 'Heads Up!',
      subtitle: 'Some things might need your attention soon.',
      emoji: '👀',
    },
    critical: {
      icon: XCircle,
      gradient: 'from-rose-500/20 via-rose-500/10 to-transparent',
      borderColor: 'border-rose-500/30',
      iconColor: 'text-rose-500',
      iconBg: 'bg-rose-500/20',
      title: 'Needs Attention',
      subtitle: 'There are some issues that need to be resolved.',
      emoji: '⚠️',
    },
    loading: {
      icon: Loader2,
      gradient: 'from-primary/20 via-primary/10 to-transparent',
      borderColor: 'border-border',
      iconColor: 'text-muted',
      iconBg: 'bg-secondary',
      title: 'Checking Status...',
      subtitle: 'Please wait while we check your system.',
      emoji: '🔄',
    },
  }

  const { icon: Icon, gradient, borderColor, iconColor, iconBg, title, subtitle, emoji } = config[status]

  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'Just started'
    if (seconds < 60) return 'Just started'
    if (seconds < 3600) return `Running for ${Math.floor(seconds / 60)} minutes`
    if (seconds < 86400) return `Running for ${Math.floor(seconds / 3600)} hours`
    return `Running for ${Math.floor(seconds / 86400)} days`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`relative overflow-hidden rounded-3xl border ${borderColor} bg-gradient-to-br ${gradient} p-6 md:p-8`}
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-white/5 to-transparent rounded-full -translate-y-32 translate-x-32" />
      
      <div className="relative flex flex-col md:flex-row md:items-center gap-6">
        <motion.div 
          className={`${iconBg} p-4 md:p-5 rounded-2xl w-fit`}
          animate={status === 'healthy' ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Icon className={`h-10 w-10 md:h-12 md:w-12 ${iconColor} ${status === 'loading' ? 'animate-spin' : ''}`} />
        </motion.div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">{title}</h2>
            <span className="text-2xl">{emoji}</span>
          </div>
          <p className="text-muted text-base md:text-lg">{subtitle}</p>
          
          <div className="flex flex-wrap gap-4 mt-4">
            {uptime !== undefined && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Clock className="h-4 w-4" />
                <span>{formatUptime(uptime)}</span>
              </div>
            )}
            {activeJobs !== undefined && activeJobs > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Activity className="h-4 w-4" />
                <span>{activeJobs} task{activeJobs !== 1 ? 's' : ''} in progress</span>
              </div>
            )}
          </div>
        </div>

        {status === 'healthy' && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="hidden md:flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-full"
          >
            <ThumbsUp className="h-5 w-5 text-emerald-500" />
            <span className="text-sm font-medium text-emerald-500">Looking good!</span>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

function QuickActionCard({ 
  icon: Icon, 
  label, 
  description,
  onClick,
  loading,
  color = 'default',
}: { 
  icon: React.ElementType
  label: string
  description: string
  onClick: () => void
  loading?: boolean
  color?: 'default' | 'primary' | 'green' | 'blue' | 'purple'
}) {
  const colorStyles = {
    default: {
      bg: 'bg-card hover:bg-secondary/80',
      iconBg: 'bg-secondary',
      iconColor: 'text-foreground',
    },
    primary: {
      bg: 'bg-primary/5 hover:bg-primary/10',
      iconBg: 'bg-primary/20',
      iconColor: 'text-primary',
    },
    green: {
      bg: 'bg-emerald-500/5 hover:bg-emerald-500/10',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-500',
    },
    blue: {
      bg: 'bg-blue-500/5 hover:bg-blue-500/10',
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-500',
    },
    purple: {
      bg: 'bg-purple-500/5 hover:bg-purple-500/10',
      iconBg: 'bg-purple-500/20',
      iconColor: 'text-purple-500',
    },
  }

  const styles = colorStyles[color]

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={loading}
      className={`
        relative overflow-hidden flex flex-col items-center text-center gap-3 p-5 rounded-2xl border border-border 
        transition-all duration-300 w-full ${styles.bg}
        disabled:opacity-50 disabled:cursor-not-allowed
        group
      `}
    >
      <motion.div 
        className={`p-4 rounded-xl ${styles.iconBg} transition-transform group-hover:scale-110`}
      >
        {loading ? (
          <Loader2 className={`h-6 w-6 ${styles.iconColor} animate-spin`} />
        ) : (
          <Icon className={`h-6 w-6 ${styles.iconColor}`} />
        )}
      </motion.div>
      <div>
        <h4 className="font-semibold text-foreground text-sm">{label}</h4>
        <p className="text-xs text-muted mt-1 leading-relaxed">{description}</p>
      </div>
      <motion.div
        className="absolute inset-0 bg-gradient-to-t from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </motion.button>
  )
}

function AgentBadge({ 
  id, 
  name, 
  installed,
  icon: Icon,
}: { 
  id: string
  name: string
  installed: boolean
  icon: React.ElementType
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.08, y: -2 }}
      className="group relative"
    >
      <div className={`
        flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-300
        ${installed 
          ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/30' 
          : 'bg-secondary/30 border-border/50 opacity-50'}
      `}>
        <div className={`
          relative p-3 rounded-xl transition-all duration-300
          ${installed ? 'bg-emerald-500/10 group-hover:bg-emerald-500/20' : 'bg-secondary'}
        `}>
          <Icon className={`h-6 w-6 ${installed ? 'text-emerald-500' : 'text-muted'}`} />
          {installed && (
            <motion.div
              className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </div>
        <span className="text-xs font-medium text-foreground capitalize">{name}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
          installed 
            ? 'bg-emerald-500/10 text-emerald-500' 
            : 'bg-secondary text-muted'
        }`}>
          {installed ? 'Ready' : 'Not set up'}
        </span>
      </div>
    </motion.div>
  )
}

function ResourceMeter({ 
  label, 
  used, 
  total, 
  unit,
  icon: Icon,
  friendlyStatus,
}: { 
  label: string
  used: number
  total: number
  unit: string
  icon: React.ElementType
  friendlyStatus?: string
}) {
  const percentage = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const color = percentage > 90 ? 'rose' : percentage > 70 ? 'amber' : 'emerald'
  
  const colorClasses = {
    emerald: {
      bar: 'bg-emerald-500',
      text: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    amber: {
      bar: 'bg-amber-500',
      text: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    rose: {
      bar: 'bg-rose-500',
      text: 'text-rose-500',
      bg: 'bg-rose-500/10',
    },
  }

  const styles = colorClasses[color]
  const defaultStatus = percentage > 90 ? 'Running low' : percentage > 70 ? 'Getting full' : 'Plenty of space'

  return (
    <motion.div 
      className="p-4 rounded-xl bg-card border border-border"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ scale: 1.01 }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${styles.bg}`}>
            <Icon className={`h-4 w-4 ${styles.text}`} />
          </div>
          <div>
            <span className="text-sm font-medium text-foreground">{label}</span>
            <p className="text-xs text-muted">{friendlyStatus || defaultStatus}</p>
          </div>
        </div>
        <span className={`text-sm font-semibold ${styles.text}`}>
          {percentage.toFixed(0)}%
        </span>
      </div>
      
      <div className="h-3 w-full rounded-full bg-secondary overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${styles.bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
        />
      </div>
      
      <div className="flex justify-between mt-2 text-xs text-muted">
        <span>{used.toFixed(0)} {unit} used</span>
        <span>{(total - used).toFixed(0)} {unit} free</span>
      </div>
    </motion.div>
  )
}

function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  const iconMap = {
    play: Rocket,
    check: PartyPopper,
    error: XCircle,
    bot: Bot,
    info: CircleDot,
  }

  const colorMap = {
    play: {
      icon: 'text-blue-500',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    check: {
      icon: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    error: {
      icon: 'text-rose-500',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
    },
    bot: {
      icon: 'text-purple-500',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
    },
    info: {
      icon: 'text-muted',
      bg: 'bg-secondary',
      border: 'border-border',
    },
  }

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`
    return new Date(timestamp).toLocaleDateString()
  }

  const getFriendlyMessage = (event: ActivityEvent) => {
    if (event.type === 'job_completed') return 'Task completed successfully! 🎉'
    if (event.type === 'job_failed') return 'Something went wrong with a task'
    if (event.type === 'job_started') return 'Started working on a new task'
    return event.message
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {events.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-10"
          >
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Coffee className="h-12 w-12 mx-auto mb-3 text-muted/50" />
            </motion.div>
            <p className="text-sm font-medium text-foreground">All quiet here</p>
            <p className="text-xs text-muted mt-1">New activity will show up as it happens</p>
          </motion.div>
        ) : (
          events.map((event, index) => {
            const Icon = iconMap[event.icon]
            const colors = colorMap[event.icon]
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.08 }}
                className={`flex items-start gap-3 p-3 rounded-xl ${colors.bg} border ${colors.border}`}
              >
                <div className={`p-2 rounded-lg ${colors.bg}`}>
                  <Icon className={`h-4 w-4 ${colors.icon}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium">{getFriendlyMessage(event)}</p>
                  <p className="text-xs text-muted mt-1">{formatTime(event.timestamp)}</p>
                </div>
              </motion.div>
            )
          })
        )}
      </AnimatePresence>
    </div>
  )
}

function SummaryCard({ 
  icon: Icon, 
  label, 
  value, 
  subtext,
  color = 'default',
}: { 
  icon: React.ElementType
  label: string
  value: string | number
  subtext?: string
  color?: 'default' | 'green' | 'blue' | 'purple' | 'amber'
}) {
  const colorStyles = {
    default: {
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
    },
    green: {
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-500',
    },
    blue: {
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-500',
    },
    purple: {
      iconBg: 'bg-purple-500/10',
      iconColor: 'text-purple-500',
    },
    amber: {
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-500',
    },
  }

  const styles = colorStyles[color]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ duration: 0.3 }}
      className="bg-card border border-border rounded-2xl p-5 hover:shadow-lg hover:shadow-black/5 transition-all duration-300"
    >
      <div className={`p-3 rounded-xl ${styles.iconBg} w-fit mb-4`}>
        <Icon className={`h-6 w-6 ${styles.iconColor}`} />
      </div>
      <div>
        <p className="text-3xl font-bold text-foreground">{value}</p>
        <p className="text-sm font-medium text-foreground mt-1">{label}</p>
        {subtext && <p className="text-xs text-muted mt-1">{subtext}</p>}
      </div>
    </motion.div>
  )
}

const agentIcons: Record<string, React.ElementType> = {
  cursor: Code,
  gemini: Sparkles,
  claude: Bot,
  copilot: Zap,
  codex: Code,
  rovo: Search,
  custom: Settings,
}

const agentFriendlyNames: Record<string, string> = {
  cursor: 'Cursor',
  gemini: 'Gemini',
  claude: 'Claude',
  copilot: 'Copilot',
  codex: 'Codex',
  rovo: 'Rovo',
  custom: 'Custom',
}

export function EclipseDashboard() {
  const router = useRouter()
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const jobs = useSwarmStore((s) => s.jobs)
  const isRunning = useSwarmStore((s) => s.isRunning)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health')
      if (res.ok) {
        const data = await res.json()
        setHealth(normalizeHealthData(data))
      }
    } catch {
      // API may not be available
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  useEffect(() => {
    const newActivities: ActivityEvent[] = jobs.slice(0, 5).map((job) => ({
      id: job.id,
      type: job.status === 'completed' ? 'job_completed' : 
            job.status === 'failed' ? 'job_failed' : 
            job.status === 'running' ? 'job_started' : 'system',
      message: job.status === 'completed' ? `Task completed successfully` :
               job.status === 'failed' ? `Task failed: ${job.error || 'Unknown error'}` :
               job.status === 'running' ? `Working on: ${job.prompt.slice(0, 50)}...` :
               `Task queued: ${job.prompt.slice(0, 50)}...`,
      timestamp: job.completedAt || job.startedAt || job.createdAt,
      icon: job.status === 'completed' ? 'check' : 
            job.status === 'failed' ? 'error' : 
            job.status === 'running' ? 'play' : 'info',
    }))
    setActivities(newActivities)
  }, [jobs])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchHealth()
  }

  const getHealthStatus = (): HealthStatus => {
    if (loading) return 'loading'
    if (!health) return 'warning'

    const fallbackMemoryPercent =
      health.memoryUsage.heapTotal > 0
        ? (health.memoryUsage.heapUsed / health.memoryUsage.heapTotal) * 100
        : 0
    const memoryPercent = health.systemMemory?.usagePercent ?? fallbackMemoryPercent

    if (memoryPercent > 90 || health.status === 'unhealthy') return 'critical'
    if (memoryPercent > 70 || health.queueDepth > 5 || health.status === 'degraded') return 'warning'
    return 'healthy'
  }

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return 'Just started'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86400)}d`
  }

  const getUptimeFriendly = (seconds?: number) => {
    if (!seconds || seconds < 60) return 'Fresh start!'
    if (seconds < 3600) return 'Running smoothly'
    if (seconds < 86400) return 'Going strong'
    return 'Rock solid'
  }

  const memoryUsed = health?.memoryUsage 
    ? health.memoryUsage.heapUsed / (1024 * 1024) 
    : 0
  const memoryTotal = health?.memoryUsage 
    ? health.memoryUsage.heapTotal / (1024 * 1024) 
    : 1
  const memoryPercent = memoryTotal > 0 ? (memoryUsed / memoryTotal) * 100 : 0

  const installedAgents = health?.installedCLIs?.filter(c => c.installed) || []
  const totalAgents = health?.installedCLIs?.length || 0

  const cacheHitRate = health?.cacheStats 
    ? Math.round((health.cacheStats.hits / Math.max(1, health.cacheStats.hits + health.cacheStats.misses)) * 100)
    : 0

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div 
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Welcome Back!</h1>
          <p className="text-muted mt-1">Here&apos;s how your system is doing today</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Checking...' : 'Refresh'}
        </Button>
      </motion.div>

      {/* Hero Status Card */}
      <HeroStatusCard 
        status={getHealthStatus()} 
        uptime={health?.uptime}
        activeJobs={health?.activeJobCount}
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={Activity}
          label="Active Tasks"
          value={health?.activeJobCount || 0}
          subtext={isRunning ? 'Working on it...' : 'Ready for more'}
          color="blue"
        />
        <SummaryCard
          icon={ListTodo}
          label="Waiting in Line"
          value={health?.queueDepth || 0}
          subtext="Tasks queued up"
          color="purple"
        />
        <SummaryCard
          icon={Timer}
          label="Uptime"
          value={health ? formatUptime(health.uptime) : '-'}
          subtext={getUptimeFriendly(health?.uptime)}
          color="green"
        />
        <SummaryCard
          icon={Zap}
          label="Speed Boost"
          value={`${cacheHitRate}%`}
          subtext="Cached responses"
          color="amber"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Performance Gauges */}
          <Card className="border-border overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                How Things Are Running
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 py-4">
                <ProgressRing
                  progress={memoryPercent}
                  size={130}
                  strokeWidth={12}
                  color={memoryPercent > 90 ? 'red' : memoryPercent > 70 ? 'yellow' : 'green'}
                  icon={Cpu}
                  label="Memory"
                  friendlyLabel={memoryPercent > 90 ? 'Running low!' : memoryPercent > 70 ? 'Getting busy' : 'Looking good'}
                />
                <ProgressRing
                  progress={totalAgents > 0 ? (installedAgents.length / totalAgents) * 100 : 0}
                  size={130}
                  strokeWidth={12}
                  color="blue"
                  icon={Bot}
                  label="Assistants"
                  friendlyLabel={`${installedAgents.length} of ${totalAgents} ready`}
                />
                <ProgressRing
                  progress={cacheHitRate}
                  size={130}
                  strokeWidth={12}
                  color={cacheHitRate > 70 ? 'green' : cacheHitRate > 40 ? 'yellow' : 'primary'}
                  icon={Zap}
                  label="Efficiency"
                  friendlyLabel={cacheHitRate > 70 ? 'Super fast!' : cacheHitRate > 40 ? 'Pretty good' : 'Warming up'}
                />
              </div>
            </CardContent>
          </Card>

          {/* Resource Usage */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-primary" />
                Resource Usage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ResourceMeter
                label="App Memory"
                used={memoryUsed}
                total={memoryTotal}
                unit="MB"
                icon={Cpu}
                friendlyStatus={memoryPercent > 90 ? 'Time to free up some space' : memoryPercent > 70 ? 'Getting cozy in here' : 'Plenty of room'}
              />
              {health?.systemMemory && (
                <ResourceMeter
                  label="System Memory"
                  used={health.systemMemory.totalMemMB - health.systemMemory.freeMemMB}
                  total={health.systemMemory.totalMemMB}
                  unit="MB"
                  icon={HardDrive}
                  friendlyStatus={health.systemMemory.usagePercent > 90 ? 'System is working hard' : health.systemMemory.usagePercent > 70 ? 'Moderate usage' : 'System is relaxed'}
                />
              )}
            </CardContent>
          </Card>

          {/* Available Assistants */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                Your AI Assistants
                <span className="ml-auto text-sm font-normal text-muted">
                  {installedAgents.length} ready to help
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader2 className="h-10 w-10 text-muted" />
                  </motion.div>
                </div>
              ) : health?.installedCLIs && health.installedCLIs.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {health.installedCLIs.map((cli, index) => (
                    <motion.div
                      key={cli.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <AgentBadge
                        id={cli.id}
                        name={agentFriendlyNames[cli.id] || cli.id}
                        installed={cli.installed}
                        icon={agentIcons[cli.id] || Bot}
                      />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <motion.div 
                  className="text-center py-10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Star className="h-12 w-12 mx-auto mb-3 text-muted/50" />
                  <p className="text-sm font-medium text-foreground">No assistants yet</p>
                  <p className="text-xs text-muted mt-1">Add some in settings to get started</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4 gap-2"
                    onClick={() => router.push('/settings')}
                  >
                    <Settings className="h-4 w-4" />
                    Open Settings
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <QuickActionCard
                  icon={Heart}
                  label="Health Check"
                  description="Make sure everything's OK"
                  onClick={handleRefresh}
                  loading={refreshing}
                  color="green"
                />
                <QuickActionCard
                  icon={CheckSquare}
                  label="Run Tests"
                  description="Check your code"
                  onClick={() => useSwarmStore.getState().setActiveTab('testing')}
                  color="blue"
                />
                <QuickActionCard
                  icon={FileText}
                  label="View Logs"
                  description="See what happened"
                  onClick={() => useSwarmStore.getState().setActiveTab('dashboard')}
                  color="purple"
                />
                <QuickActionCard
                  icon={Settings}
                  label="Settings"
                  description="Customize your setup"
                  onClick={() => router.push('/settings')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline events={activities} />
            </CardContent>
          </Card>

          {/* Tip Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-5"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Info className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground text-sm">Quick Tip</h4>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Keep your memory usage below 70% for the best performance. 
                  The dashboard refreshes automatically every 30 seconds.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Mobile-friendly bottom padding */}
      <div className="h-6 md:h-0" />
    </div>
  )
}

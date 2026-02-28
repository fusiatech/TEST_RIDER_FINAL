export interface Breakpoint {
  id: string
  file: string
  line: number
  column?: number
  enabled: boolean
  condition?: string
  hitCount?: number
  verified: boolean
}

export interface StackFrame {
  id: number
  name: string
  file: string
  line: number
  column: number
  source?: string
}

export interface Variable {
  name: string
  value: string
  type: string
  variablesReference: number
  evaluateName?: string
}

export interface Scope {
  name: string
  variablesReference: number
  expensive: boolean
}

export interface EvaluateResult {
  result: string
  type: string
  variablesReference: number
}

export type DebugSessionStatus = 'idle' | 'running' | 'paused' | 'stopped'
export type DebugSessionType = 'node' | 'chrome' | 'python'

export interface DebugConfig {
  type: DebugSessionType
  program?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  port?: number
  stopOnEntry?: boolean
}

export interface DebugSession {
  id: string
  type: DebugSessionType
  status: DebugSessionStatus
  breakpoints: Breakpoint[]
  callStack: StackFrame[]
  variables: Variable[]
  scopes: Scope[]
  currentFrameId: number | null
  config: DebugConfig
  startedAt: number
  stoppedAt?: number
  stoppedReason?: string
}

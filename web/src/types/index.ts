export type AgentStatus = "idle" | "working" | "error" | "completed"

export type Agent = {
  id: string
  name: string
  type: "visionary" | "engineer"
  status: AgentStatus
  currentTask?: string
  issueNumber?: number // For engineer agents
  threadId?: string // For engineer agents
}

export type ThreadType = 'visionary' | 'engineer'

export type Thread = {
  id: string
  title?: string
  resourceId: string
  createdAt: Date
  updatedAt: Date
  metadata?: Record<string, unknown>
  type?: ThreadType
}

export type ToolCall = {
  id: string
  name: string
  status: "calling" | "complete" | "error"
  input?: Record<string, any>
  output?: any
  error?: string
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  toolCalls?: ToolCall[]
}

export type GitHubIssue = {
  number: number
  title: string
  state: string
  labels: string[]
  assignees: string[]
  url: string
  body: string
  createdAt: string
  updatedAt: string
}

export type EngineerWorker = {
  issueNumber: number
  threadId: string
  status: 'working' | 'completed' | 'error'
  startedAt: string
  lastUpdate?: string
  outputLength?: number
  error?: string
}

export type WorkerDetail = {
  issueNumber: number
  threadId: string
  status: 'working' | 'completed' | 'error'
  startedAt: string
  lastUpdate: string
  output: string
  error?: string
}
import { create } from 'zustand'
import type { Agent, Thread, ChatMessage, GitHubIssue } from '../types'
import { getStoredApiKeys } from '../components/SettingsModal'

const API_BASE = '/api'

// Log types for the logs panel
export type ToolCallLog = {
  id: string
  toolName: string
  status: 'calling' | 'complete' | 'error'
  args?: Record<string, unknown>
  result?: unknown
  error?: string
  timestamp: Date
}

export type LogEntry = {
  id: string
  type: 'text' | 'tool-call' | 'tool-result' | 'info' | 'error'
  message: string
  timestamp: Date
  toolCall?: ToolCallLog
}

// Store the current abort controller outside of zustand state (not serializable)
let currentAbortController: AbortController | null = null

interface AgentStore {
  // Agents
  agents: Agent[]
  currentAgentId: string
  
  // Threads & Messages
  threads: Thread[]
  messages: ChatMessage[]
  currentThreadId: string | null
  
  // UI State
  isLoading: boolean
  isStreaming: boolean
  
  // GitHub Issues
  issues: GitHubIssue[]
  issuesLoading: boolean
  
  // Logs
  logs: LogEntry[]

  // Actions
  setCurrentAgent: (agentId: string) => void
  setCurrentThread: (threadId: string | null) => void
  createNewThread: () => void
  loadThreads: () => Promise<void>
  loadMessages: (threadId: string) => Promise<void>
  deleteThread: (threadId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  abortStream: () => void
  
  // Issue actions
  loadIssues: () => Promise<void>
  startEngineer: (issueNumber: number) => Promise<void>
  
  // Log actions
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void
  clearLogs: () => void
}

// ============ SSE Stream Parser ============
// Unified streaming logic for all agent responses

interface StreamCallbacks {
  onText: (content: string) => void
  onToolCall: (toolCall: { id: string; name: string; args: Record<string, unknown> }) => void
  onToolResult: (result: { toolCallId: string; result: unknown }) => void
  onStepFinish: () => void
  onFinish: () => void
}

async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: StreamCallbacks
) {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    buffer += decoder.decode(value, { stream: true })
    
    // Process complete SSE messages
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          
          if (data.type === 'text') {
            const content = typeof data.content === 'string' 
              ? data.content 
              : (data.content ? JSON.stringify(data.content) : '')
            if (content) {
              callbacks.onText(content)
            }
          } else if (data.type === 'step-finish') {
            callbacks.onStepFinish()
          } else if (data.type === 'tool-call') {
            callbacks.onToolCall({
              id: data.toolCallId,
              name: data.toolName,
              args: data.args || {},
            })
          } else if (data.type === 'tool-result') {
            callbacks.onToolResult({
              toolCallId: data.toolCallId,
              result: data.result,
            })
          } else if (data.type === 'finish') {
            callbacks.onFinish()
          }
        } catch {
          // Ignore parse errors for incomplete JSON
        }
      }
    }
  }
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [
    { id: "pv-1", name: "Product Visionary", type: "visionary", status: "idle" },
  ],
  currentAgentId: "pv-1",
  threads: [],
  messages: [],
  currentThreadId: null,
  isLoading: false,
  isStreaming: false,
  issues: [],
  issuesLoading: false,
  logs: [],

  setCurrentAgent: (agentId: string) => {
    set({ currentAgentId: agentId })
  },

  setCurrentThread: (threadId: string | null) => {
    const { isStreaming } = get()
    
    set({ currentThreadId: threadId })
    if (threadId) {
      // Determine agent from thread ID
      if (threadId.startsWith('engineer-')) {
        const issueNumber = parseInt(threadId.replace('engineer-', ''), 10)
        set({ currentAgentId: `eng-${issueNumber}` })
      } else {
        set({ currentAgentId: 'pv-1' })
      }
      // Only load messages if not streaming
      if (!isStreaming) {
        get().loadMessages(threadId)
      }
    } else {
      set({ messages: [] })
    }
  },

  createNewThread: () => {
    set({ currentThreadId: null, messages: [], currentAgentId: "pv-1" })
  },

  deleteThread: async (threadId: string) => {
    try {
      // If this is an engineer thread, clean up the worktree first
      if (threadId.startsWith('engineer-')) {
        const issueNumber = parseInt(threadId.replace('engineer-', ''), 10)
        try {
          await fetch(`${API_BASE}/worktree/${issueNumber}`, { method: 'DELETE' })
        } catch {
          // Continue even if worktree cleanup fails
        }
      }
      
      const res = await fetch(`${API_BASE}/threads/${threadId}`, { method: 'DELETE' })
      
      if (!res.ok) {
        throw new Error('Failed to delete thread')
      }
      
      set((state) => {
        const isCurrentThread = state.currentThreadId === threadId
        const issueNumber = threadId.startsWith('engineer-') 
          ? parseInt(threadId.replace('engineer-', ''), 10) 
          : null
        
        return {
          threads: state.threads.filter(t => t.id !== threadId),
          currentThreadId: isCurrentThread ? null : state.currentThreadId,
          messages: isCurrentThread ? [] : state.messages,
          agents: issueNumber 
            ? state.agents.filter(a => a.id !== `eng-${issueNumber}`)
            : state.agents,
        }
      })
    } catch (error) {
      console.error('Failed to delete thread:', error)
    }
  },

  loadThreads: async () => {
    try {
      set({ isLoading: true })
      const res = await fetch(`${API_BASE}/threads`)
      const data = await res.json()
      
      const threads: Thread[] = (data.threads || []).map((t: Record<string, unknown>) => ({
        id: t.id,
        title: t.title || (String(t.id).startsWith('engineer-') 
          ? `Engineer: Issue #${String(t.id).replace('engineer-', '')}`
          : 'Untitled'),
        resourceId: t.resourceId,
        createdAt: new Date(t.createdAt as string),
        updatedAt: new Date(t.updatedAt as string),
        metadata: t.metadata,
      }))
      
      threads.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      
      const engineerAgents: Agent[] = threads
        .filter(t => t.id.startsWith('engineer-'))
        .map(t => {
          const issueNumber = parseInt(t.id.replace('engineer-', ''), 10)
          return {
            id: `eng-${issueNumber}`,
            name: `Engineer`,
            type: 'engineer' as const,
            status: 'idle' as const,
            currentTask: `Issue #${issueNumber}`,
            issueNumber,
            threadId: t.id,
          }
        })
      
      set({ 
        threads,
        agents: [
          { id: "pv-1", name: "Product Visionary", type: "visionary", status: "idle" },
          ...engineerAgents,
        ]
      })
    } catch (error) {
      console.error('Failed to load threads:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  loadMessages: async (threadId: string) => {
    try {
      set({ isLoading: true })
      const res = await fetch(`${API_BASE}/threads/${threadId}/messages`)
      const data = await res.json()
      
      const messages: ChatMessage[] = (data.messages || [])
        .filter((m: Record<string, unknown>) => m.role === 'user' || m.role === 'assistant')
        .map((m: Record<string, unknown>) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: extractTextContent(m.content),
          timestamp: new Date(m.createdAt as string),
        }))
        .filter((m: ChatMessage) => m.content.trim() !== '')
      
      set({ messages })
    } catch (error) {
      console.error('Failed to load messages:', error)
      set({ messages: [] })
    } finally {
      set({ isLoading: false })
    }
  },

  sendMessage: async (content: string) => {
    const { currentThreadId, currentAgentId, messages } = get()
    
    const isEngineer = currentAgentId.startsWith('eng-')
    const issueNumber = isEngineer ? parseInt(currentAgentId.replace('eng-', ''), 10) : null
    
    // Generate thread ID if new
    let threadId = currentThreadId
    if (!threadId) {
      threadId = isEngineer ? `engineer-${issueNumber}` : `visionary-${crypto.randomUUID()}`
      set({ currentThreadId: threadId })
      
      // Add optimistic thread
      const now = new Date()
      set((state) => ({
        threads: [{
          id: threadId!,
          title: isEngineer ? `Engineer: Issue #${issueNumber}` : content.slice(0, 50) + (content.length > 50 ? '...' : ''),
          resourceId: 'founder-mode-user',
          createdAt: now,
          updatedAt: now,
        }, ...state.threads]
      }))
    }

    // Add user message optimistically
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    }
    set({ messages: [...messages, userMessage] })

    // Add placeholder for assistant and start streaming
    const assistantMessageId = crypto.randomUUID()
    set((state) => ({ 
      messages: [...state.messages, {
        id: assistantMessageId,
        role: 'assistant' as const,
        content: '',
        timestamp: new Date(),
      }],
      isStreaming: true,
    }))

    // Track state for this stream
    let fullContent = ''
    const toolCalls = new Map<string, ToolCallLog>()

    try {
      const apiKeys = getStoredApiKeys()
      currentAbortController = new AbortController()
      
      // Unified endpoint - pass agentType to let server decide
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: content, 
          threadId,
          agentType: isEngineer ? 'engineer' : 'visionary',
          issueNumber,
          apiKeys,
        }),
        signal: currentAbortController.signal,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to send message')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      await parseSSEStream(reader, {
        onText: (text) => {
          fullContent += text
          set((state) => ({
            messages: state.messages.map((m) => 
              m.id === assistantMessageId ? { ...m, content: fullContent } : m
            )
          }))
        },
        onStepFinish: () => {
          fullContent += '\n\n'
          set((state) => ({
            messages: state.messages.map((m) => 
              m.id === assistantMessageId ? { ...m, content: fullContent } : m
            )
          }))
        },
        onToolCall: ({ id, name, args }) => {
          const toolLog: ToolCallLog = {
            id,
            toolName: name,
            status: 'calling',
            args,
            timestamp: new Date(),
          }
          toolCalls.set(id, toolLog)
          
          set((state) => ({
            messages: state.messages.map((m) => 
              m.id === assistantMessageId 
                ? { 
                    ...m, 
                    toolCalls: [...(m.toolCalls || []), {
                      id,
                      name,
                      status: 'calling' as const,
                      input: args,
                    }]
                  }
                : m
            )
          }))
          
          get().addLog({ 
            type: 'tool-call', 
            message: `Calling ${name}`,
            toolCall: toolLog,
          })
        },
        onToolResult: ({ toolCallId, result }) => {
          const existing = toolCalls.get(toolCallId)
          if (existing) {
            existing.status = 'complete'
            existing.result = result
            
            set((state) => ({
              messages: state.messages.map((m) => 
                m.id === assistantMessageId 
                  ? { 
                      ...m, 
                      toolCalls: (m.toolCalls || []).map(tc =>
                        tc.id === toolCallId
                          ? { ...tc, status: 'complete' as const, output: result }
                          : tc
                      )
                    }
                  : m
              ),
              logs: state.logs.map(log => 
                log.toolCall?.id === toolCallId
                  ? { ...log, toolCall: { ...existing } }
                  : log
              )
            }))
          }
        },
        onFinish: () => {
          get().addLog({ type: 'info', message: 'Completed' })
        },
      })

      await get().loadThreads()
      
    } catch (error: any) {
      if (error.name === 'AbortError') return
      
      console.error('Failed to send message:', error)
      set((state) => ({
        messages: state.messages.map((m) => 
          m.id === assistantMessageId 
            ? { ...m, content: `Error: ${error.message}` }
            : m
        )
      }))
    } finally {
      currentAbortController = null
      set({ isStreaming: false })
    }
  },

  // ============ Issue Actions ============
  
  loadIssues: async () => {
    try {
      set({ issuesLoading: true })
      const res = await fetch(`${API_BASE}/issues?state=open`)
      const data = await res.json()
      set({ issues: data.issues || [] })
    } catch (error) {
      console.error('Failed to load issues:', error)
    } finally {
      set({ issuesLoading: false })
    }
  },

  startEngineer: async (issueNumber: number) => {
    const threadId = `engineer-${issueNumber}`
    
    // Setup UI state
    set({ 
      currentAgentId: `eng-${issueNumber}`,
      currentThreadId: threadId,
      messages: [],
      isStreaming: true,
      logs: [],
    })
    
    // Add/update engineer agent
    set((state) => {
      const existingEngineer = state.agents.find(a => a.id === `eng-${issueNumber}`)
      if (!existingEngineer) {
        return {
          agents: [...state.agents, {
            id: `eng-${issueNumber}`,
            name: `Engineer`,
            type: 'engineer' as const,
            status: 'working' as const,
            currentTask: `Issue #${issueNumber}`,
            issueNumber,
            threadId,
          }]
        }
      }
      return {
        agents: state.agents.map(a => 
          a.id === `eng-${issueNumber}` ? { ...a, status: 'working' as const } : a
        )
      }
    })
    
    // Add placeholder message
    const assistantMessageId = crypto.randomUUID()
    set({
      messages: [{
        id: assistantMessageId,
        role: 'assistant' as const,
        content: '',
        timestamp: new Date(),
      }],
    })

    // Track state for this stream
    let fullContent = ''
    const toolCalls = new Map<string, ToolCallLog>()

    try {
      const apiKeys = getStoredApiKeys()
      get().addLog({ type: 'info', message: `Starting engineer for issue #${issueNumber}` })
      
      currentAbortController = new AbortController()
      
      const res = await fetch(`${API_BASE}/engineer/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueNumber, apiKeys }),
        signal: currentAbortController.signal,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to start engineer')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      await parseSSEStream(reader, {
        onText: (text) => {
          fullContent += text
          set((state) => ({
            messages: state.messages.map((m) => 
              m.id === assistantMessageId ? { ...m, content: fullContent } : m
            )
          }))
        },
        onStepFinish: () => {
          fullContent += '\n\n'
          set((state) => ({
            messages: state.messages.map((m) => 
              m.id === assistantMessageId ? { ...m, content: fullContent } : m
            )
          }))
        },
        onToolCall: ({ id, name, args }) => {
          const toolLog: ToolCallLog = {
            id,
            toolName: name,
            status: 'calling',
            args,
            timestamp: new Date(),
          }
          toolCalls.set(id, toolLog)
          
          set((state) => ({
            messages: state.messages.map((m) => 
              m.id === assistantMessageId 
                ? { 
                    ...m, 
                    toolCalls: [...(m.toolCalls || []), {
                      id,
                      name,
                      status: 'calling' as const,
                      input: args,
                    }]
                  }
                : m
            )
          }))
          
          get().addLog({ 
            type: 'tool-call', 
            message: `Calling ${name}`,
            toolCall: toolLog,
          })
        },
        onToolResult: ({ toolCallId, result }) => {
          const existing = toolCalls.get(toolCallId)
          if (existing) {
            existing.status = 'complete'
            existing.result = result
            
            set((state) => ({
              messages: state.messages.map((m) => 
                m.id === assistantMessageId 
                  ? { 
                      ...m, 
                      toolCalls: (m.toolCalls || []).map(tc =>
                        tc.id === toolCallId
                          ? { ...tc, status: 'complete' as const, output: result }
                          : tc
                      )
                    }
                  : m
              ),
              logs: state.logs.map(log => 
                log.toolCall?.id === toolCallId
                  ? { ...log, toolCall: { ...existing } }
                  : log
              )
            }))
          }
        },
        onFinish: () => {
          get().addLog({ type: 'info', message: 'Engineer completed' })
        },
      })

      // Mark engineer as completed
      set((state) => ({
        agents: state.agents.map(a => 
          a.id === `eng-${issueNumber}` ? { ...a, status: 'completed' as const } : a
        )
      }))
      
      await get().loadThreads()
      
    } catch (error: any) {
      if (error.name === 'AbortError') return
      
      console.error('Failed to start engineer:', error)
      set((state) => ({
        messages: state.messages.map((m) => 
          m.id === assistantMessageId 
            ? { ...m, content: `Error: ${error.message}` }
            : m
        ),
        agents: state.agents.map(a => 
          a.id === `eng-${issueNumber}` ? { ...a, status: 'error' as const } : a
        )
      }))
    } finally {
      currentAbortController = null
      set({ isStreaming: false })
    }
  },
  
  abortStream: () => {
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
    }
    
    const { currentAgentId } = get()
    const issueNumber = currentAgentId.startsWith('eng-') 
      ? parseInt(currentAgentId.replace('eng-', ''), 10) 
      : null
    
    set((state) => ({
      isStreaming: false,
      agents: issueNumber 
        ? state.agents.map(a => 
            a.id === `eng-${issueNumber}` ? { ...a, status: 'idle' as const } : a
          )
        : state.agents,
    }))
    
    get().addLog({ type: 'info', message: 'Aborted by user' })
  },
  
  addLog: (log) => {
    const entry: LogEntry = {
      ...log,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }
    set((state) => ({
      logs: [...state.logs.slice(-200), entry]
    }))
  },
  
  clearLogs: () => {
    set({ logs: [] })
  },
}))

// Helper to extract text from Mastra message format
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  
  const c = content as Record<string, unknown>
  
  if (c?.format === 2 && Array.isArray(c.parts)) {
    return (c.parts as Record<string, unknown>[])
      .map((part) => {
        if (part.type === 'text' && part.text) return part.text as string
        if (part.type === 'tool-invocation' || part.type === 'tool-call') return ''
        return (part.text as string) || ''
      })
      .filter(Boolean)
      .join('')
  }
  
  if (Array.isArray(content)) {
    return content
      .map((item: unknown) => {
        const i = item as Record<string, unknown>
        return i.text || (typeof item === 'string' ? item : '')
      })
      .filter(Boolean)
      .join('')
  }
  
  if (c?.text) return c.text as string
  
  return ''
}

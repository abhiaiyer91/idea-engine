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
    // Don't reload messages if we're currently streaming (e.g., engineer just started)
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
      // Only load messages if not streaming - otherwise we'll wipe out in-progress messages
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
          await fetch(`${API_BASE}/worktree/${issueNumber}`, {
            method: 'DELETE',
          })
          console.log(`[deleteThread] Cleaned up worktree for issue #${issueNumber}`)
        } catch (e) {
          console.warn(`[deleteThread] Failed to cleanup worktree for issue #${issueNumber}:`, e)
          // Continue with thread deletion even if worktree cleanup fails
        }
      }
      
      const res = await fetch(`${API_BASE}/threads/${threadId}`, {
        method: 'DELETE',
      })
      
      if (!res.ok) {
        throw new Error('Failed to delete thread')
      }
      
      // Remove from local state and also remove the engineer agent if applicable
      set((state) => {
        const isCurrentThread = state.currentThreadId === threadId
        const issueNumber = threadId.startsWith('engineer-') 
          ? parseInt(threadId.replace('engineer-', ''), 10) 
          : null
        
        return {
          threads: state.threads.filter(t => t.id !== threadId),
          currentThreadId: isCurrentThread ? null : state.currentThreadId,
          messages: isCurrentThread ? [] : state.messages,
          // Remove the engineer agent associated with this thread
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
      
      // Sort by most recent
      threads.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      
      // Build agent list from engineer threads
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
    
    // Determine if this is for visionary or engineer
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

    // Add placeholder for assistant
    const assistantMessageId = crypto.randomUUID()
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }
    set((state) => ({ 
      messages: [...state.messages, assistantMessage],
      isStreaming: true,
    }))

    try {
      const apiKeys = getStoredApiKeys()
      
      // Create abort controller for this request
      currentAbortController = new AbortController()
      
      // Choose endpoint based on agent type
      const endpoint = isEngineer ? `${API_BASE}/engineer/chat` : `${API_BASE}/chat`
      const body = isEngineer 
        ? { message: content, issueNumber, apiKeys }
        : { message: content, threadId, apiKeys }
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: currentAbortController.signal,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to send message')
      }

      // Stream the response
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''
      const toolCalls = new Map<string, ToolCallLog>()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          
          // Check if this is SSE format (engineer) or plain text (visionary)
          if (isEngineer) {
            // Parse SSE for engineers
            buffer += chunk
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  
                  if (data.type === 'text') {
                    // Handle content - ensure it's a string
                    const content = typeof data.content === 'string' 
                      ? data.content 
                      : (data.content ? JSON.stringify(data.content) : '')
                    fullContent += content
                    set((state) => ({
                      messages: state.messages.map((m) => 
                        m.id === assistantMessageId 
                          ? { ...m, content: fullContent }
                          : m
                      )
                    }))
                  } else if (data.type === 'step-finish') {
                    // Add paragraph break between steps
                    fullContent += '\n\n'
                    set((state) => ({
                      messages: state.messages.map((m) => 
                        m.id === assistantMessageId 
                          ? { ...m, content: fullContent }
                          : m
                      )
                    }))
                  } else if (data.type === 'tool-call') {
                    const toolLog: ToolCallLog = {
                      id: data.toolCallId,
                      toolName: data.toolName,
                      status: 'calling',
                      args: data.args,
                      timestamp: new Date(),
                    }
                    toolCalls.set(data.toolCallId, toolLog)
                    // Add tool call to message
                    set((state) => ({
                      messages: state.messages.map((m) => 
                        m.id === assistantMessageId 
                          ? { 
                              ...m, 
                              toolCalls: [
                                ...(m.toolCalls || []),
                                {
                                  id: data.toolCallId,
                                  name: data.toolName,
                                  status: 'calling' as const,
                                  input: data.args,
                                }
                              ]
                            }
                          : m
                      )
                    }))
                    get().addLog({ 
                      type: 'tool-call', 
                      message: `Calling ${data.toolName}`,
                      toolCall: toolLog,
                    })
                  } else if (data.type === 'tool-result') {
                    const existing = toolCalls.get(data.toolCallId)
                    if (existing) {
                      existing.status = 'complete'
                      existing.result = data.result
                      // Update tool call status in message
                      set((state) => ({
                        messages: state.messages.map((m) => 
                          m.id === assistantMessageId 
                            ? { 
                                ...m, 
                                toolCalls: (m.toolCalls || []).map(tc =>
                                  tc.id === data.toolCallId
                                    ? { ...tc, status: 'complete' as const, output: data.result }
                                    : tc
                                )
                              }
                            : m
                        ),
                        logs: state.logs.map(log => 
                          log.toolCall?.id === data.toolCallId
                            ? { ...log, toolCall: { ...existing } }
                            : log
                        )
                      }))
                    }
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }
            }
          } else {
            // Plain text for visionary
            fullContent += chunk
            set((state) => ({
              messages: state.messages.map((m) => 
                m.id === assistantMessageId 
                  ? { ...m, content: fullContent }
                  : m
              )
            }))
          }
        }
      }

      // Refresh threads
      await get().loadThreads()
      
    } catch (error: any) {
      // Ignore abort errors - they're expected when user clicks Stop
      if (error.name === 'AbortError') {
        return
      }
      
      console.error('Failed to send message:', error)
      const errorMessage = error.message || 'Failed to get response'
      set((state) => ({
        messages: state.messages.map((m) => 
          m.id === assistantMessageId 
            ? { ...m, content: `Error: ${errorMessage}` }
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

  // Start an engineer on an issue - creates thread and sends initial prompt
  startEngineer: async (issueNumber: number) => {
    const threadId = `engineer-${issueNumber}`
    
    // Switch to engineer view
    set({ 
      currentAgentId: `eng-${issueNumber}`,
      currentThreadId: threadId,
      messages: [],
      isStreaming: true,
    })
    
    // Add engineer agent if not exists
    set((state) => {
      const existingEngineer = state.agents.find(a => a.id === `eng-${issueNumber}`)
      if (!existingEngineer) {
        return {
          agents: [
            ...state.agents,
            {
              id: `eng-${issueNumber}`,
              name: `Engineer`,
              type: 'engineer' as const,
              status: 'working' as const,
              currentTask: `Issue #${issueNumber}`,
              issueNumber,
              threadId,
            }
          ]
        }
      }
      return {
        agents: state.agents.map(a => 
          a.id === `eng-${issueNumber}` 
            ? { ...a, status: 'working' as const }
            : a
        )
      }
    })
    
    // Add placeholder message and clear logs in single update
    const assistantMessageId = crypto.randomUUID()
    set({
      messages: [{
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }],
      logs: [],
    })

    try {
      const apiKeys = getStoredApiKeys()
      
      get().addLog({ type: 'info', message: `Starting engineer for issue #${issueNumber}` })
      
      // Create abort controller for this request
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

      // Stream the SSE response
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''
      const toolCalls = new Map<string, ToolCallLog>()

      if (reader) {
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
                  // Handle content - ensure it's a string
                  const content = typeof data.content === 'string' 
                    ? data.content 
                    : (data.content ? JSON.stringify(data.content) : '')
                  fullContent += content
                  set((state) => ({
                    messages: state.messages.map((m) => 
                      m.id === assistantMessageId 
                        ? { ...m, content: fullContent }
                        : m
                    )
                  }))
                } else if (data.type === 'step-finish') {
                  // Add paragraph break between steps
                  fullContent += '\n\n'
                  set((state) => ({
                    messages: state.messages.map((m) => 
                      m.id === assistantMessageId 
                        ? { ...m, content: fullContent }
                        : m
                    )
                  }))
                } else if (data.type === 'tool-call') {
                  // Tool call started
                  const toolLog: ToolCallLog = {
                    id: data.toolCallId,
                    toolName: data.toolName,
                    status: 'calling',
                    args: data.args,
                    timestamp: new Date(),
                  }
                  toolCalls.set(data.toolCallId, toolLog)
                  // Add tool call to message
                  set((state) => ({
                    messages: state.messages.map((m) => 
                      m.id === assistantMessageId 
                        ? { 
                            ...m, 
                            toolCalls: [
                              ...(m.toolCalls || []),
                              {
                                id: data.toolCallId,
                                name: data.toolName,
                                status: 'calling' as const,
                                input: data.args,
                              }
                            ]
                          }
                        : m
                    )
                  }))
                  get().addLog({ 
                    type: 'tool-call', 
                    message: `Calling ${data.toolName}`,
                    toolCall: toolLog,
                  })
                } else if (data.type === 'tool-result') {
                  // Tool call completed
                  const existing = toolCalls.get(data.toolCallId)
                  if (existing) {
                    existing.status = 'complete'
                    existing.result = data.result
                    // Update tool call status in message
                    set((state) => ({
                      messages: state.messages.map((m) => 
                        m.id === assistantMessageId 
                          ? { 
                              ...m, 
                              toolCalls: (m.toolCalls || []).map(tc =>
                                tc.id === data.toolCallId
                                  ? { ...tc, status: 'complete' as const, output: data.result }
                                  : tc
                              )
                            }
                          : m
                      ),
                      logs: state.logs.map(log => 
                        log.toolCall?.id === data.toolCallId
                          ? { ...log, toolCall: { ...existing } }
                          : log
                      )
                    }))
                  }
                } else if (data.type === 'finish') {
                  get().addLog({ type: 'info', message: 'Engineer completed' })
                }
              } catch (e) {
                // Ignore parse errors for incomplete JSON
              }
            }
          }
        }
      }

      // Mark engineer as completed
      set((state) => ({
        agents: state.agents.map(a => 
          a.id === `eng-${issueNumber}` 
            ? { ...a, status: 'completed' as const }
            : a
        )
      }))
      
      // Refresh threads
      await get().loadThreads()
      
    } catch (error: any) {
      // Ignore abort errors - they're expected when user clicks Stop
      if (error.name === 'AbortError') {
        return
      }
      
      console.error('Failed to start engineer:', error)
      set((state) => ({
        messages: state.messages.map((m) => 
          m.id === assistantMessageId 
            ? { ...m, content: `Error: ${error.message}` }
            : m
        ),
        agents: state.agents.map(a => 
          a.id === `eng-${issueNumber}` 
            ? { ...a, status: 'error' as const }
            : a
        )
      }))
    } finally {
      currentAbortController = null
      set({ isStreaming: false })
    }
  },
  
  // Abort the current streaming request
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
      // Mark engineer as idle if we were running one
      agents: issueNumber 
        ? state.agents.map(a => 
            a.id === `eng-${issueNumber}` 
              ? { ...a, status: 'idle' as const }
              : a
          )
        : state.agents,
    }))
    
    get().addLog({ type: 'info', message: 'Aborted by user' })
  },
  
  // Log actions
  addLog: (log) => {
    const entry: LogEntry = {
      ...log,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }
    set((state) => ({
      logs: [...state.logs.slice(-200), entry] // Keep last 200 logs
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

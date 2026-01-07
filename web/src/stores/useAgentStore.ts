import { create } from 'zustand'
import type { Agent, Thread, ChatMessage, GitHubIssue, ToolCall } from '../types'
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
  
  // Issue actions
  loadIssues: () => Promise<void>
  startEngineer: (issueNumber: number) => Promise<void>
  
  // Log actions
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void
  clearLogs: () => void
}

// Helper function to extract tool calls from message content
function extractContentAndToolCalls(content: any): { text: string; toolCalls: ToolCall[] } {
  let text = ""
  let toolCalls: ToolCall[] = []
  
  // Simple string
  if (typeof content === 'string') {
    return { text: content, toolCalls: [] }
  }
  
  // MastraMessageContentV2 format: { format: 2, parts: [...] }
  if (content?.format === 2 && Array.isArray(content.parts)) {
    const textParts: string[] = []
    
    content.parts.forEach((part: any) => {
      try {
        // Text part
        if (part.type === 'text' && part.text) {
          textParts.push(part.text)
        }
        // Tool call/invocation
        else if (part.type === 'tool-invocation' || part.type === 'tool-call') {
          let status: 'calling' | 'complete' | 'error' = 'calling'
          if (part.error) {
            status = 'error'
          } else if (part.result !== undefined || part.output !== undefined) {
            status = 'complete'
          }
          
          const toolCall: ToolCall = {
            id: part.id || crypto.randomUUID(),
            name: part.toolName || part.name || 'unknown',
            status,
            input: part.args || part.input || {},
            output: part.result || part.output,
            error: part.error
          }
          toolCalls.push(toolCall)
        }
        // Handle tool-result parts
        else if (part.type === 'tool-result') {
          const existingCall = toolCalls.find(tc => tc.id === part.toolCallId)
          if (existingCall) {
            existingCall.output = part.result
            existingCall.status = part.isError ? 'error' : 'complete'
            if (part.isError) {
              existingCall.error = part.result
            }
          }
        }
      } catch (partError: any) {
        console.warn(`Error processing message part: ${partError.message}`)
      }
    })
    
    text = textParts.filter(Boolean).join('')
  }
  // Legacy array format
  else if (Array.isArray(content)) {
    text = content
      .map((c: any) => c.text || (typeof c === 'string' ? c : ''))
      .filter(Boolean)
      .join('')
  }
  // Object with text property
  else if (content?.text) {
    text = content.text
  }
  
  return { text, toolCalls }
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
    set({ currentThreadId: threadId })
    if (threadId) {
      // Determine agent from thread ID
      if (threadId.startsWith('engineer-')) {
        const issueNumber = parseInt(threadId.replace('engineer-', ''), 10)
        set({ currentAgentId: `eng-${issueNumber}` })
      } else {
        set({ currentAgentId: 'pv-1' })
      }
      get().loadMessages(threadId)
    } else {
      set({ messages: [] })
    }
  },

  createNewThread: () => {
    set({ currentThreadId: null, messages: [], currentAgentId: "pv-1" })
  },

  loadThreads: async () => {
    try {
      set({ isLoading: true })
      const res = await fetch(`${API_BASE}/threads`)
      const data = await res.json()
      set({ threads: data.threads || [] })
    } catch (error) {
      console.error('Failed to load threads:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  loadMessages: async (threadId: string) => {
    try {
      const res = await fetch(`${API_BASE}/threads/${threadId}/messages`)
      const data = await res.json()
      
      // Parse messages and extract tool calls
      const parsedMessages: ChatMessage[] = (data.messages || [])
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any) => {
          const { text, toolCalls } = extractContentAndToolCalls(m.content)
          return {
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: text,
            timestamp: new Date(m.createdAt),
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          }
        })
        .filter((m: ChatMessage) => m.content.trim() !== '' || (m.toolCalls && m.toolCalls.length > 0))

      set({ messages: parsedMessages })
    } catch (error) {
      console.error('Failed to load messages:', error)
      set({ messages: [] })
    }
  },

  deleteThread: async (threadId: string) => {
    try {
      await fetch(`${API_BASE}/threads/${threadId}`, { method: 'DELETE' })
      set((state) => ({
        threads: state.threads.filter(t => t.id !== threadId),
        currentThreadId: state.currentThreadId === threadId ? null : state.currentThreadId,
        messages: state.currentThreadId === threadId ? [] : state.messages,
      }))
    } catch (error) {
      console.error('Failed to delete thread:', error)
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
      
      // Choose endpoint based on agent type
      const endpoint = isEngineer ? `${API_BASE}/engineer/chat` : `${API_BASE}/chat`
      const body = isEngineer 
        ? { message: content, issueNumber, apiKeys }
        : { message: content, threadId, apiKeys }
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
      const toolCallsMap = new Map<string, ToolCall>()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          
          // Check if this is SSE format (engineer) or plain text (visionary)
          if (isEngineer) {
            // Parse SSE for engineers
            buffer += chunk
            const lines = buffer.split('\\n')
            buffer = lines.pop() || ''
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  
                  if (data.type === 'text') {
                    fullContent += data.content || ''
                    set((state) => ({
                      messages: state.messages.map((m) => 
                        m.id === assistantMessageId 
                          ? { ...m, content: fullContent }
                          : m
                      )
                    }))
                  } else if (data.type === 'tool-call') {
                    // Create tool call and add to message
                    const toolCall: ToolCall = {
                      id: data.toolCallId,
                      name: data.toolName,
                      status: 'calling',
                      input: data.args || {},
                    }
                    toolCallsMap.set(data.toolCallId, toolCall)
                    
                    // Update message with tool calls
                    set((state) => ({
                      messages: state.messages.map((m) => 
                        m.id === assistantMessageId 
                          ? { ...m, toolCalls: Array.from(toolCallsMap.values()) }
                          : m
                      )
                    }))
                    
                    // Also add to logs
                    const toolLog: ToolCallLog = {
                      id: data.toolCallId,
                      toolName: data.toolName,
                      status: 'calling',
                      args: data.args,
                      timestamp: new Date(),
                    }
                    get().addLog({ 
                      type: 'tool-call', 
                      message: `Calling ${data.toolName}`,
                      toolCall: toolLog,
                    })
                  } else if (data.type === 'tool-result') {
                    // Update existing tool call with result
                    const existing = toolCallsMap.get(data.toolCallId)
                    if (existing) {
                      existing.status = 'complete'
                      existing.output = data.result
                      
                      // Update message with updated tool calls
                      set((state) => ({
                        messages: state.messages.map((m) => 
                          m.id === assistantMessageId 
                            ? { ...m, toolCalls: Array.from(toolCallsMap.values()) }
                            : m
                        )
                      }))
                      
                      // Update logs
                      set((state) => ({
                        logs: state.logs.map(log => 
                          log.toolCall?.id === data.toolCallId
                            ? { ...log, toolCall: { ...log.toolCall, status: 'complete', result: data.result } }
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
    console.log('[startEngineer] Starting engineer for issue:', issueNumber)
    const threadId = `engineer-${issueNumber}`
    
    // Switch to engineer view
    set({ 
      currentAgentId: `eng-${issueNumber}`,
      currentThreadId: threadId,
      messages: [],
      isStreaming: true,
    })
    console.log('[startEngineer] Set currentThreadId:', threadId)
    
    // Add engineer agent if not exists
    set((state) => {
      const existingAgent = state.agents.find(a => a.id === `eng-${issueNumber}`)
      if (!existingAgent) {
        return {
          agents: [...state.agents, {
            id: `eng-${issueNumber}`,
            name: `Engineer-${issueNumber}`,
            type: 'engineer' as const,
            status: 'working' as const,
            issueNumber,
            threadId,
          }]
        }
      }
      return {}
    })
    
    try {
      const apiKeys = getStoredApiKeys()
      const res = await fetch(`${API_BASE}/engineer/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueNumber, apiKeys }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to start engineer')
      }

      // Stream the response
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''
      const toolCallsMap = new Map<string, ToolCall>()

      // Add initial assistant message
      const assistantMessageId = crypto.randomUUID()
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }
      set((state) => ({ 
        messages: [assistantMessage],
      }))

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          buffer += chunk
          const lines = buffer.split('\\n')
          buffer = lines.pop() || ''
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                
                if (data.type === 'text') {
                  fullContent += data.content || ''
                  set((state) => ({
                    messages: state.messages.map((m) => 
                      m.id === assistantMessageId 
                        ? { ...m, content: fullContent }
                        : m
                    )
                  }))
                } else if (data.type === 'tool-call') {
                  // Create tool call and add to message
                  const toolCall: ToolCall = {
                    id: data.toolCallId,
                    name: data.toolName,
                    status: 'calling',
                    input: data.args || {},
                  }
                  toolCallsMap.set(data.toolCallId, toolCall)
                  
                  // Update message with tool calls
                  set((state) => ({
                    messages: state.messages.map((m) => 
                      m.id === assistantMessageId 
                        ? { ...m, toolCalls: Array.from(toolCallsMap.values()) }
                        : m
                    )
                  }))
                  
                  // Also add to logs
                  const toolLog: ToolCallLog = {
                    id: data.toolCallId,
                    toolName: data.toolName,
                    status: 'calling',
                    args: data.args,
                    timestamp: new Date(),
                  }
                  get().addLog({ 
                    type: 'tool-call', 
                    message: `Calling ${data.toolName}`,
                    toolCall: toolLog,
                  })
                } else if (data.type === 'tool-result') {
                  // Update existing tool call with result
                  const existing = toolCallsMap.get(data.toolCallId)
                  if (existing) {
                    existing.status = 'complete'
                    existing.output = data.result
                    
                    // Update message with updated tool calls
                    set((state) => ({
                      messages: state.messages.map((m) => 
                        m.id === assistantMessageId 
                          ? { ...m, toolCalls: Array.from(toolCallsMap.values()) }
                          : m
                      )
                    }))
                    
                    // Update logs
                    set((state) => ({
                      logs: state.logs.map(log => 
                        log.toolCall?.id === data.toolCallId
                          ? { ...log, toolCall: { ...log.toolCall, status: 'complete', result: data.result } }
                          : log
                      )
                    }))
                  }
                } else if (data.type === 'finish') {
                  // Engineer finished
                  set((state) => ({
                    agents: state.agents.map(a => 
                      a.id === `eng-${issueNumber}`
                        ? { ...a, status: 'completed' as const }
                        : a
                    )
                  }))
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }

      // Refresh threads
      await get().loadThreads()
      
    } catch (error: any) {
      console.error('Failed to start engineer:', error)
      const errorMessage = error.message || 'Failed to start engineer'
      
      // Add error message
      const errorMessageObj: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${errorMessage}`,
        timestamp: new Date(),
      }
      set((state) => ({ 
        messages: [errorMessageObj],
        agents: state.agents.map(a => 
          a.id === `eng-${issueNumber}`
            ? { ...a, status: 'error' as const }
            : a
        )
      }))
    } finally {
      set({ isStreaming: false })
    }
  },

  // ============ Log Actions ============
  
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => {
    set((state) => ({
      logs: [...state.logs, {
        ...log,
        id: crypto.randomUUID(),
        timestamp: new Date(),
      }]
    }))
  },

  clearLogs: () => {
    set({ logs: [] })
  },
}))
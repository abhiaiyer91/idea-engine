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

// Enhanced tool call parsing to handle various formats
function parseToolCallBlocks(text: string): { cleanText: string; toolCalls: ToolCall[] } {
  const toolCalls: ToolCall[] = []
  let cleanText = text

  // Pattern 1: <function_calls> blocks (Claude format)
  const claudeToolCallRegex = /<function_calls>([\s\S]*?)<\/antml:function_calls>/g
  const claudeInvokeRegex = /<invoke name="([^"]+)">([\s\S]*?)<\/antml:invoke>/g
  const claudeParamRegex = /<parameter name="([^"]+)">([^<]*)<\/antml:parameter>/g
  
  let blockMatch
  while ((blockMatch = claudeToolCallRegex.exec(text)) !== null) {
    const blockContent = blockMatch[1]
    
    // Parse individual invocations within the block
    let invokeMatch
    while ((invokeMatch = claudeInvokeRegex.exec(blockContent)) !== null) {
      const toolName = invokeMatch[1]
      const invokeContent = invokeMatch[2]
      
      // Parse parameters
      const input: Record<string, any> = {}
      let paramMatch
      while ((paramMatch = claudeParamRegex.exec(invokeContent)) !== null) {
        const paramName = paramMatch[1]
        const paramValue = paramMatch[2].trim()
        
        // Try to parse JSON values, fallback to string
        try {
          input[paramName] = JSON.parse(paramValue)
        } catch {
          input[paramName] = paramValue
        }
      }
      
      toolCalls.push({
        id: crypto.randomUUID(),
        name: toolName,
        status: 'calling',
        input
      })
    }
    
    // Remove the tool call block from the text
    cleanText = cleanText.replace(blockMatch[0], '')
  }

  // Pattern 2: JSON tool call blocks (OpenAI format)
  const jsonToolCallRegex = /```json\s*\{\s*"tool_calls":\s*\[([\s\S]*?)\]\s*\}\s*```/g
  let jsonMatch
  while ((jsonMatch = jsonToolCallRegex.exec(text)) !== null) {
    try {
      const toolCallsJson = JSON.parse(`[${jsonMatch[1]}]`)
      toolCallsJson.forEach((tc: any) => {
        toolCalls.push({
          id: tc.id || crypto.randomUUID(),
          name: tc.function?.name || tc.name || 'unknown',
          status: 'calling',
          input: tc.function?.arguments ? JSON.parse(tc.function.arguments) : tc.arguments || {}
        })
      })
      
      // Remove the JSON block from the text
      cleanText = cleanText.replace(jsonMatch[0], '')
    } catch (e) {
      console.warn('Failed to parse JSON tool call block:', e)
    }
  }

  // Pattern 3: Raw JSON objects that look like tool calls
  const rawJsonRegex = /\{[^}]*"(?:tool_calls?|function_calls?|name)"[^}]*\}/g
  let rawMatch
  while ((rawMatch = rawJsonRegex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(rawMatch[0])
      if (obj.name || obj.function?.name) {
        toolCalls.push({
          id: obj.id || crypto.randomUUID(),
          name: obj.function?.name || obj.name,
          status: 'calling',
          input: obj.function?.arguments ? JSON.parse(obj.function.arguments) : obj.arguments || obj.parameters || {}
        })
        
        // Remove the raw JSON from the text
        cleanText = cleanText.replace(rawMatch[0], '')
      }
    } catch (e) {
      // Not a valid JSON object, ignore
    }
  }

  return { cleanText: cleanText.trim(), toolCalls }
}

// Helper function to extract tool calls from message content
function extractContentAndToolCalls(content: any): { text: string; toolCalls: ToolCall[] } {
  let text = ""
  let toolCalls: ToolCall[] = []
  
  // Simple string - check for embedded tool calls
  if (typeof content === 'string') {
    const { cleanText, toolCalls: parsedToolCalls } = parseToolCallBlocks(content)
    return { text: cleanText, toolCalls: parsedToolCalls }
  }
  
  // MastraMessageContentV2 format: { format: 2, parts: [...] }
  if (content?.format === 2 && Array.isArray(content.parts)) {
    const textParts: string[] = []
    
    content.parts.forEach((part: any) => {
      try {
        // Text part
        if (part.type === 'text' && part.text) {
          // Parse tool calls from text content
          const { cleanText, toolCalls: parsedToolCalls } = parseToolCallBlocks(part.text)
          if (cleanText.trim()) {
            textParts.push(cleanText)
          }
          toolCalls.push(...parsedToolCalls)
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
        // Handle tool-result parts (separate from tool calls)
        else if (part.type === 'tool-result') {
          // Find corresponding tool call and update it
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
        console.warn('Error processing message part:', partError.message)
      }
    })
    
    text = textParts.filter(Boolean).join('')
  }
  // Legacy array format
  else if (Array.isArray(content)) {
    const textContent = content
      .map((c: any) => c.text || (typeof c === 'string' ? c : ''))
      .filter(Boolean)
      .join('')
    
    const { cleanText, toolCalls: parsedToolCalls } = parseToolCallBlocks(textContent)
    text = cleanText
    toolCalls = parsedToolCalls
  }
  // Object with text property
  else if (content?.text) {
    const { cleanText, toolCalls: parsedToolCalls } = parseToolCallBlocks(content.text)
    text = cleanText
    toolCalls = parsedToolCalls
  }
  
  return { text, toolCalls }
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  // ============ Initial State ============
  agents: [
    { id: 'pv-1', name: 'Product Visionary', type: 'visionary', status: 'idle' },
  ],
  currentAgentId: 'pv-1',
  
  threads: [],
  messages: [],
  currentThreadId: null,
  
  isLoading: false,
  isStreaming: false,
  
  issues: [],
  issuesLoading: false,
  
  logs: [],

  // ============ Agent Actions ============
  
  setCurrentAgent: (agentId: string) => {
    console.log('[setCurrentAgent] Setting agent:', agentId)
    set({ currentAgentId: agentId })
    
    // If switching to engineer, load their thread
    if (agentId.startsWith('eng-')) {
      const issueNumber = parseInt(agentId.replace('eng-', ''), 10)
      const threadId = `engineer-${issueNumber}`
      console.log('[setCurrentAgent] Loading engineer thread:', threadId)
      get().setCurrentThread(threadId)
      get().loadMessages(threadId)
    }
  },

  setCurrentThread: (threadId: string | null) => {
    console.log('[setCurrentThread] Setting thread:', threadId)
    set({ currentThreadId: threadId, messages: [] })
    if (threadId) {
      get().loadMessages(threadId)
    }
  },

  createNewThread: () => {
    console.log('[createNewThread] Creating new thread')
    set({ currentThreadId: null, messages: [] })
  },

  // ============ Thread & Message Actions ============
  
  loadThreads: async () => {
    try {
      set({ isLoading: true })
      const res = await fetch(`${API_BASE}/threads`)
      const data = await res.json()
      
      const threads: Thread[] = (data.threads || []).map((t: any) => ({
        id: t.id,
        title: t.title || 'Untitled Thread',
        resourceId: t.resourceId,
        createdAt: new Date(t.createdAt),
        updatedAt: new Date(t.updatedAt),
        metadata: t.metadata || {},
        type: t.id.startsWith('engineer-') ? 'engineer' : 'visionary'
      }))
      
      set({ threads })
    } catch (error) {
      console.error('Failed to load threads:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  loadMessages: async (threadId: string) => {
    try {
      console.log('[loadMessages] Loading messages for thread:', threadId)
      const res = await fetch(`${API_BASE}/threads/${threadId}/messages`)
      const data = await res.json()
      
      const messages: ChatMessage[] = (data.messages || [])
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
      
      console.log('[loadMessages] Loaded messages:', messages.length, 'messages with', messages.filter(m => m.toolCalls).length, 'having tool calls')
      set({ messages })
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
        messages: state.currentThreadId === threadId ? [] : state.messages
      }))
    } catch (error) {
      console.error('Failed to delete thread:', error)
    }
  },

  sendMessage: async (content: string) => {
    const { currentAgentId, currentThreadId } = get()
    
    // Add user message immediately
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    }
    
    set((state) => ({ 
      messages: [...state.messages, userMessage],
      isStreaming: true 
    }))

    try {
      const apiKeys = getStoredApiKeys()
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: content, 
          agentId: currentAgentId,
          threadId: currentThreadId,
          apiKeys 
        }),
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

      // Add initial assistant message
      const assistantMessageId = crypto.randomUUID()
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }
      set((state) => ({ 
        messages: [...state.messages, assistantMessage],
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
                  
                  // Parse tool calls from the accumulated content
                  const { cleanText, toolCalls: parsedToolCalls } = parseToolCallBlocks(fullContent)
                  
                  // Merge with existing tool calls from streaming
                  const allToolCalls = [...Array.from(toolCallsMap.values()), ...parsedToolCalls]
                  
                  set((state) => ({
                    messages: state.messages.map((m) => 
                      m.id === assistantMessageId 
                        ? { 
                            ...m, 
                            content: cleanText,
                            toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined
                          }
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
                    existing.status = data.isError ? 'error' : 'complete'
                    existing.output = data.result
                    if (data.isError) {
                      existing.error = data.result
                    }
                    
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
                          ? { ...log, toolCall: { ...log.toolCall, status: existing.status, result: data.result, error: data.isError ? data.result : undefined } }
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
        }
        
        // Final content update to ensure tool calls are properly parsed
        if (fullContent) {
          const { cleanText, toolCalls: finalToolCalls } = parseToolCallBlocks(fullContent)
          const allToolCalls = [...Array.from(toolCallsMap.values()), ...finalToolCalls]
          
          set((state) => ({
            messages: state.messages.map((m) => 
              m.id === assistantMessageId 
                ? { 
                    ...m, 
                    content: cleanText,
                    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined
                  }
                : m
            )
          }))
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
                  
                  // Parse tool calls from the accumulated content
                  const { cleanText, toolCalls: parsedToolCalls } = parseToolCallBlocks(fullContent)
                  
                  // Merge with existing tool calls from streaming
                  const allToolCalls = [...Array.from(toolCallsMap.values()), ...parsedToolCalls]
                  
                  set((state) => ({
                    messages: state.messages.map((m) => 
                      m.id === assistantMessageId 
                        ? { 
                            ...m, 
                            content: cleanText,
                            toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined
                          }
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
        
        // Final content update to ensure tool calls are properly parsed
        if (fullContent) {
          const { cleanText, toolCalls: finalToolCalls } = parseToolCallBlocks(fullContent)
          const allToolCalls = [...Array.from(toolCallsMap.values()), ...finalToolCalls]
          
          set((state) => ({
            messages: state.messages.map((m) => 
              m.id === assistantMessageId 
                ? { 
                    ...m, 
                    content: cleanText,
                    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined
                  }
                : m
            )
          }))
        }
      }

      // Refresh threads
      await get().loadThreads()
      
    } catch (error: any) {
      console.error('Failed to start engineer:', error)
      set((state) => ({
        agents: state.agents.map(a => 
          a.id === `eng-${issueNumber}`
            ? { ...a, status: 'error' as const }
            : a
        ),
        isStreaming: false
      }))
    } finally {
      set({ isStreaming: false })
    }
  },

  // ============ Log Actions ============
  
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newLog: LogEntry = {
      ...log,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }
    set((state) => ({ logs: [...state.logs, newLog] }))
  },

  clearLogs: () => {
    set({ logs: [] })
  },
}))
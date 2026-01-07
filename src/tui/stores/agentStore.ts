import { createSignal } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { mastra, storage } from "../../mastra"
import type { Agent, AgentStatus, ChatMessage, ToolCall } from "../App"
import { logger } from "./logStore"

// Types matching Mastra's StorageThreadType
export type Thread = {
  id: string
  title?: string
  resourceId: string
  createdAt: Date
  updatedAt: Date
  metadata?: Record<string, unknown>
}

// Agent state store
const [agents, setAgents] = createStore<Agent[]>([
  { id: "pv-1", name: "Product Visionary", type: "visionary", status: "idle" },
  { id: "eng-1", name: "Engineer-1", type: "engineer", status: "idle" },
  { id: "eng-2", name: "Engineer-2", type: "engineer", status: "idle" },
])

const [threads, setThreads] = createStore<Thread[]>([])
const [currentThreadId, setCurrentThreadId] = createSignal<string | null>(null)

// Messages store - use signal for the array to ensure proper reactivity on clear
const [messages, setMessagesInternal] = createSignal<ChatMessage[]>([])

// Helper to set all messages
function setMessages(msgs: ChatMessage[]) {
  setMessagesInternal(msgs)
}

// Memory identifiers
const resourceId: string = "founder-mode-user"

// Get the Product Visionary agent
function getVisionary() {
  return mastra.getAgent('productVisionaryAgent')
}

// Load threads from Mastra storage
async function loadThreadsFromStorage(): Promise<void> {
  try {
    const memoryStore = await storage.getStore('memory')
    if (!memoryStore) {
      logger.warn("Memory store not available")
      return
    }
    
    const result = await memoryStore.listThreadsByResourceId({ resourceId })
    
    const loadedThreads: Thread[] = result.threads.map((t: any) => ({
      id: t.id,
      title: t.title || "Untitled",
      resourceId: t.resourceId,
      createdAt: new Date(t.createdAt),
      updatedAt: new Date(t.updatedAt),
      metadata: t.metadata,
    }))

    // Sort by most recent
    loadedThreads.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    
    setThreads(loadedThreads)
    logger.info(`Loaded ${loadedThreads.length} threads`)

    // Select most recent thread if available and none selected
    if (loadedThreads.length > 0 && !currentThreadId()) {
      await loadMessagesForThread(loadedThreads[0].id)
      setCurrentThreadId(loadedThreads[0].id)
    }
  } catch (error: any) {
    logger.error(`Failed to load threads: ${error.message}`)
  }
}

// Enhanced tool call extraction with better error handling and status detection
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
        // Tool call/invocation with enhanced status detection
        else if (part.type === 'tool-invocation' || part.type === 'tool-call') {
          // Determine status more accurately
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
        logger.warn(`Error processing message part: ${partError.message}`)
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

// Load messages for a thread
async function loadMessagesForThread(threadId: string): Promise<void> {
  try {
    const memoryStore = await storage.getStore('memory')
    if (!memoryStore) {
      logger.warn("Memory store not available")
      setMessages([])
      return
    }
    
    const result = await memoryStore.listMessages({ threadId })
    
    const loadedMessages: ChatMessage[] = result.messages
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
      .filter((m: ChatMessage) => m.content.trim() !== '' || (m.toolCalls && m.toolCalls.length > 0)) // Keep messages with tool calls even if no text

    setMessages(loadedMessages)
    logger.info(`Loaded ${loadedMessages.length} messages for thread ${threadId}`)
  } catch (error: any) {
    logger.error(`Failed to load messages: ${error.message}`)
    setMessages([])
  }
}

// Initialize store
let initialized = false

export function useAgentStore() {
  // Initialize on first use
  if (!initialized) {
    initialized = true
    loadThreadsFromStorage()
  }

  const updateAgentStatus = (agentId: string, status: AgentStatus, currentTask?: string) => {
    const index = agents.findIndex(a => a.id === agentId)
    if (index !== -1) {
      setAgents(index, { status, currentTask })
    }
  }

  const addMessage = (message: ChatMessage) => {
    setMessages([...messages(), message])
  }

  const updateMessageContent = (messageId: string, content: string) => {
    setMessages(
      messages().map((m) => 
        m.id === messageId ? { ...m, content } : m
      )
    )
  }

  // Enhanced method to update tool call status in real-time
  const updateToolCallStatus = (messageId: string, toolCallId: string, status: 'calling' | 'complete' | 'error', output?: any, error?: string) => {
    setMessages(
      messages().map((m) => {
        if (m.id === messageId && m.toolCalls) {
          const updatedToolCalls = m.toolCalls.map(tc => 
            tc.id === toolCallId 
              ? { ...tc, status, output, error }
              : tc
          )
          return { ...m, toolCalls: updatedToolCalls }
        }
        return m
      })
    )
  }

  const selectThread = async (threadId: string) => {
    setCurrentThreadId(threadId)
    await loadMessagesForThread(threadId)
    logger.info(`Switched to thread: ${threadId}`)
  }

  const createNewThread = () => {
    // Clear current state - new thread will be created on first message
    logger.info(`createNewThread called. Current messages: ${messages().length}`)
    setCurrentThreadId(null)
    setMessages([])
    logger.info(`After clear. Messages: ${messages().length}, threadId: ${currentThreadId()}`)
  }

  const refreshThreads = async () => {
    await loadThreadsFromStorage()
  }

  const sendToVisionary = async (userMessage: string): Promise<void> => {
    // Use existing thread ID or generate a new one
    let threadId = currentThreadId()
    const isNewThread = !threadId
    
    if (!threadId) {
      threadId = crypto.randomUUID()
      setCurrentThreadId(threadId)
      logger.info(`Created new thread: ${threadId}`)
      
      // Optimistically add thread to UI (prepend to list)
      const now = new Date()
      const newThread: Thread = {
        id: threadId,
        title: userMessage.slice(0, 50) + (userMessage.length > 50 ? "..." : ""),
        resourceId,
        createdAt: now,
        updatedAt: now,
        metadata: {},
      }
      setThreads(produce((t) => t.unshift(newThread)))
    }

    // Add user message to UI immediately
    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    })

    // Update agent status
    updateAgentStatus("pv-1", "working", "Processing...")

    // Create placeholder for streaming response
    const assistantMessageId = crypto.randomUUID()
    addMessage({
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    })

    try {
      // Always pass threadId and resourceId
      const streamOptions: Record<string, any> = { 
        threadId,
        resourceId,
      }

      const response = await getVisionary().stream(userMessage, streamOptions)

      // Stream text chunks and update the message
      let fullContent = ""
      for await (const chunk of response.textStream) {
        fullContent += chunk
        updateMessageContent(assistantMessageId, fullContent)
      }

      // If no text came through, show a default message
      if (!fullContent) {
        updateMessageContent(assistantMessageId, "I processed your request.")
      }

      // Update thread's updatedAt timestamp in UI
      const threadIndex = threads.findIndex(t => t.id === threadId)
      if (threadIndex !== -1) {
        setThreads(threadIndex, "updatedAt", new Date())
      }

      // Give Mastra a moment to persist, then refresh threads list
      await new Promise(resolve => setTimeout(resolve, 500))
      await refreshThreads()

    } catch (error: any) {
      updateMessageContent(assistantMessageId, `Error: ${error.message}`)
      logger.error(`Visionary error: ${error.message}`)
      
      // If this was a new thread that failed, clear it
      if (isNewThread) {
        setCurrentThreadId(null)
      }
    } finally {
      updateAgentStatus("pv-1", "idle")
    }
  }

  return {
    agents,
    threads,
    messages, // Return the signal accessor, call it as messages() in components
    currentThreadId,
    updateAgentStatus,
    updateToolCallStatus,
    sendToVisionary,
    createNewThread,
    selectThread,
    refreshThreads,
  }
}
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

// Tool call parsing utilities
function parseToolCallBlocks(text: string): { cleanText: string; toolCalls: ToolCall[] } {
  const toolCallRegex = /<function_calls>([\s\S]*?)<\/antml:function_calls>/g
  const invokeRegex = /<invoke name="([^"]+)">([\s\S]*?)<\/antml:invoke>/g
  const paramRegex = /<parameter name="([^"]+)">([^<]*)<\/antml:parameter>/g
  
  const toolCalls: ToolCall[] = []
  let cleanText = text
  
  // Find all tool call blocks
  let blockMatch
  while ((blockMatch = toolCallRegex.exec(text)) !== null) {
    const blockContent = blockMatch[1]
    
    // Parse individual invocations within the block
    let invokeMatch
    while ((invokeMatch = invokeRegex.exec(blockContent)) !== null) {
      const toolName = invokeMatch[1]
      const invokeContent = invokeMatch[2]
      
      // Parse parameters
      const input: Record<string, any> = {}
      let paramMatch
      while ((paramMatch = paramRegex.exec(invokeContent)) !== null) {
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
  
  return { cleanText: cleanText.trim(), toolCalls }
}

// Load threads from Mastra storage
async function loadThreadsFromStorage(): Promise<void> {
  try {
    const memoryStore = await storage.getStore('memory')
    if (!memoryStore) {
      logger.warn("Memory store not available")
      return
    }

    const allThreads = await memoryStore.getThreads(resourceId)
    
    // Convert to our Thread type and sort by updatedAt (newest first)
    const convertedThreads: Thread[] = allThreads
      .map((t: any) => ({
        id: t.id,
        title: t.title || "Untitled Thread",
        resourceId: t.resourceId,
        createdAt: new Date(t.createdAt),
        updatedAt: new Date(t.updatedAt),
        metadata: t.metadata || {},
      }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

    setThreads(convertedThreads)
    logger.info(`Loaded ${convertedThreads.length} threads`)
  } catch (error: any) {
    logger.error(`Failed to load threads: ${error.message}`)
  }
}

// Load messages for a specific thread
async function loadMessagesForThread(threadId: string): Promise<void> {
  try {
    const memoryStore = await storage.getStore('memory')
    if (!memoryStore) {
      logger.warn("Memory store not available")
      return
    }

    const threadMessages = await memoryStore.getMessages(threadId)
    
    // Convert to our ChatMessage type
    const convertedMessages: ChatMessage[] = threadMessages.map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.createdAt),
      toolCalls: m.toolCalls || [],
    }))

    setMessages(convertedMessages)
    logger.info(`Loaded ${convertedMessages.length} messages for thread ${threadId}`)
  } catch (error: any) {
    logger.error(`Failed to load messages for thread ${threadId}: ${error.message}`)
  }
}

export function useAgentStore() {
  // Initialize by loading threads
  loadThreadsFromStorage()

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
      messages().map((m) => {
        if (m.id === messageId) {
          // Parse tool calls from content and clean the text
          const { cleanText, toolCalls: parsedToolCalls } = parseToolCallBlocks(content)
          
          // Merge with existing tool calls, avoiding duplicates
          const existingToolCalls = m.toolCalls || []
          const mergedToolCalls = [...existingToolCalls]
          
          parsedToolCalls.forEach(newToolCall => {
            const existingIndex = mergedToolCalls.findIndex(tc => 
              tc.name === newToolCall.name && 
              JSON.stringify(tc.input) === JSON.stringify(newToolCall.input)
            )
            
            if (existingIndex === -1) {
              mergedToolCalls.push(newToolCall)
            }
          })
          
          return { 
            ...m, 
            content: cleanText,
            toolCalls: mergedToolCalls.length > 0 ? mergedToolCalls : m.toolCalls
          }
        }
        return m
      })
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

  // Enhanced method to add tool calls to a message in real-time
  const addToolCallToMessage = (messageId: string, toolCall: ToolCall) => {
    setMessages(
      messages().map((m) => {
        if (m.id === messageId) {
          const existingToolCalls = m.toolCalls || []
          // Check if tool call already exists (by id)
          const existingIndex = existingToolCalls.findIndex(tc => tc.id === toolCall.id)
          
          let updatedToolCalls: ToolCall[]
          if (existingIndex >= 0) {
            // Update existing tool call
            updatedToolCalls = existingToolCalls.map((tc, index) => 
              index === existingIndex ? toolCall : tc
            )
          } else {
            // Add new tool call
            updatedToolCalls = [...existingToolCalls, toolCall]
          }
          
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

      // Enhanced streaming with better tool call parsing
      let fullContent = ""
      const toolCallsMap = new Map<string, ToolCall>()

      // Process both text and tool calls from the full stream
      if (response.fullStream) {
        try {
          for await (const streamPart of response.fullStream) {
            // Handle text chunks
            if (streamPart.type === 'text-delta' || streamPart.type === 'text') {
              fullContent += streamPart.textDelta || streamPart.text || ""
              updateMessageContent(assistantMessageId, fullContent)
            }
            // Handle tool calls
            else if (streamPart.type === 'tool-call' || streamPart.type === 'tool-invocation') {
              const toolCall: ToolCall = {
                id: streamPart.id || crypto.randomUUID(),
                name: streamPart.toolName || streamPart.name || 'unknown',
                status: 'calling',
                input: streamPart.args || streamPart.input || {},
              }
              
              toolCallsMap.set(toolCall.id, toolCall)
              addToolCallToMessage(assistantMessageId, toolCall)
              logger.info(`Tool call started: ${toolCall.name}`)
            }
            // Handle tool results
            else if (streamPart.type === 'tool-result') {
              const toolCallId = streamPart.toolCallId || streamPart.id
              if (toolCallId && toolCallsMap.has(toolCallId)) {
                const toolCall = toolCallsMap.get(toolCallId)!
                const updatedToolCall: ToolCall = {
                  ...toolCall,
                  status: streamPart.isError ? 'error' : 'complete',
                  output: streamPart.result,
                  error: streamPart.isError ? streamPart.result : undefined
                }
                
                toolCallsMap.set(toolCallId, updatedToolCall)
                addToolCallToMessage(assistantMessageId, updatedToolCall)
                logger.info(`Tool call ${updatedToolCall.status}: ${toolCall.name}`)
              }
            }
          }
        } catch (streamError: any) {
          logger.warn(`Error processing stream: ${streamError.message}`)
        }
      } else {
        // Fallback to text stream only
        for await (const chunk of response.textStream) {
          fullContent += chunk
          updateMessageContent(assistantMessageId, fullContent)
        }
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
    addToolCallToMessage,
    sendToVisionary,
    createNewThread,
    selectThread,
    refreshThreads,
  }
}
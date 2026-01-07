import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAgentStore } from '../stores/useAgentStore'
import type { ChatMessage } from '../types'
import { ToolCallComponent } from './ToolCallComponent'

function Message({ message, agentType }: { message: ChatMessage; agentType: 'visionary' | 'engineer' }) {
  const isUser = message.role === 'user'
  const agentLabel = agentType === 'engineer' ? 'Engineer: ' : 'Visionary: '
  const agentColor = agentType === 'engineer' ? 'text-orange-500' : 'text-blue-500'
  const borderColor = agentType === 'engineer' ? 'border-orange-500' : 'border-blue-500'
  
  return (
    <div className="space-y-2">
      {/* Message text */}
      {message.content.trim() !== '' && (
        <div className={`px-4 py-2 border-l-2 ${
          isUser ? 'border-green-500' : borderColor
        }`}>
          <div className={`font-bold mb-1 ${isUser ? 'text-green-500' : agentColor}`}>
            {isUser ? 'You: ' : agentLabel}
          </div>
          {isUser ? (
            // User messages as plain text
            <div className="text-white whitespace-pre-wrap">{message.content}</div>
          ) : (
            // Agent messages with markdown rendering
            <div className="text-white prose prose-invert prose-sm max-w-none">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  // Custom styling for markdown elements
                  h1: ({children}) => <h1 className="text-xl font-bold text-white mb-2">{children}</h1>,
                  h2: ({children}) => <h2 className="text-lg font-bold text-white mb-2">{children}</h2>,
                  h3: ({children}) => <h3 className="text-base font-bold text-white mb-1">{children}</h3>,
                  p: ({children}) => <p className="text-white mb-2 last:mb-0">{children}</p>,
                  code: ({children, className}) => {
                    const isInline = !className
                    if (isInline) {
                      return <code className="bg-gray-800 text-orange-300 px-1 py-0.5 rounded text-sm font-mono">{children}</code>
                    }
                    return (
                      <pre className="bg-gray-900 border border-gray-700 rounded p-3 overflow-x-auto my-2">
                        <code className="text-gray-300 text-sm font-mono">{children}</code>
                      </pre>
                    )
                  },
                  pre: ({children}) => <div className="my-2">{children}</div>,
                  ul: ({children}) => <ul className="list-disc list-inside text-white mb-2 space-y-1">{children}</ul>,
                  ol: ({children}) => <ol className="list-decimal list-inside text-white mb-2 space-y-1">{children}</ol>,
                  li: ({children}) => <li className="text-white">{children}</li>,
                  blockquote: ({children}) => (
                    <blockquote className="border-l-4 border-gray-500 pl-4 italic text-gray-300 my-2">
                      {children}
                    </blockquote>
                  ),
                  a: ({children, href}) => (
                    <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                  table: ({children}) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full border border-gray-700 rounded">
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({children}) => (
                    <th className="border border-gray-700 px-3 py-2 bg-gray-800 text-white font-bold text-left">
                      {children}
                    </th>
                  ),
                  td: ({children}) => (
                    <td className="border border-gray-700 px-3 py-2 text-white">
                      {children}
                    </td>
                  ),
                  strong: ({children}) => <strong className="font-bold text-white">{children}</strong>,
                  em: ({children}) => <em className="italic text-white">{children}</em>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
          {message.role === 'assistant' && message.content === '' && (
            <span className="text-yellow-400 animate-pulse">▊</span>
          )}
        </div>
      )}
      
      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="ml-4 space-y-2">
          {/* Header for multiple tool calls */}
          {message.toolCalls.length > 1 && (
            <div className="text-gray-400 text-sm font-medium border-b border-gray-700 pb-2 mb-2">
              🔧 {message.toolCalls.length} tool calls:
            </div>
          )}
          
          {/* Individual tool calls */}
          {message.toolCalls.map((toolCall) => (
            <ToolCallComponent key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ChatPanel() {
  // Use individual selectors for better reactivity
  const messages = useAgentStore(state => state.messages)
  const sendMessage = useAgentStore(state => state.sendMessage)
  const isStreaming = useAgentStore(state => state.isStreaming)
  const currentThreadId = useAgentStore(state => state.currentThreadId)
  const currentAgentId = useAgentStore(state => state.currentAgentId)
  const agents = useAgentStore(state => state.agents)
  
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Get current agent info
  const currentAgent = agents.find(a => a.id === currentAgentId)
  // Check both agent type AND thread/agent ID prefix
  const isEngineer = currentAgent?.type === 'engineer' || 
                     currentThreadId?.startsWith('engineer-') || 
                     currentAgentId?.startsWith('eng-')
  
  // Extract issue number from agent ID if not in agent object
  const issueNumber = currentAgent?.issueNumber || 
                      (currentAgentId?.startsWith('eng-') ? parseInt(currentAgentId.replace('eng-', ''), 10) : null)
  
  const agentName = isEngineer ? 'Engineer' : 'Product Visionary'
  const agentSubtitle = isEngineer 
    ? `Working on Issue #${issueNumber || '?'}` 
    : 'Describe your ideas'
  const loadMessages = useAgentStore(state => state.loadMessages)

  // Poll for engineer message updates while working
  useEffect(() => {
    if (!isEngineer || !currentThreadId) return
    
    // Poll every 2 seconds while engineer is working
    if (currentAgent?.status === 'working') {
      const interval = setInterval(() => {
        loadMessages(currentThreadId)
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [isEngineer, currentThreadId, currentAgent?.status, loadMessages])

  // Debug: log when messages change
  useEffect(() => {
    console.log('[ChatPanel] messages updated:', messages.length, 'msgs, first content:', messages[0]?.content?.slice(0, 50))
    // Also log tool calls for debugging
    messages.forEach((msg, i) => {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        console.log(`[ChatPanel] Message ${i} has ${msg.toolCalls.length} tool calls:`, msg.toolCalls.map(tc => tc.name))
      }
    })
  }, [messages])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount and thread change
  useEffect(() => {
    inputRef.current?.focus()
  }, [currentThreadId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    
    const message = input
    setInput('')
    await sendMessage(message)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#333] flex items-center gap-2">
        <span className={isEngineer ? 'text-orange-500' : 'text-green-500'}>●</span>
        <span className="text-white font-bold">{agentName}</span>
        <span className="text-gray-500">- {agentSubtitle}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Debug info */}
        <div className="text-xs text-gray-600 font-mono">
          [Debug] messages: {messages.length}, streaming: {String(isStreaming)}, content: {messages[0]?.content?.length || 0} chars
        </div>
        {messages.length === 0 ? (
          <div className="text-gray-500">
            {isEngineer 
              ? 'Engineer thread will show conversation and tool usage...'
              : 'Start by describing an idea or feature you want to build...'}
          </div>
        ) : (
          messages.map(message => (
            <Message 
              key={message.id} 
              message={message} 
              agentType={isEngineer ? 'engineer' : 'visionary'} 
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-[#333]">
        <div className="border border-[#444] rounded bg-[#111] focus-within:border-[#666]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isEngineer ? 'Message the engineer...' : 'Describe your idea...'}
            disabled={isStreaming}
            rows={3}
            className="w-full bg-transparent text-white px-3 py-2 resize-none focus:outline-none placeholder-gray-600 disabled:opacity-50"
          />
          <div className="flex justify-end px-2 pb-2">
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="px-4 py-1 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              {isStreaming ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
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
    <div className="space-y-3">
      {/* Message text - only show if there's actual content */}
      {message.content.trim() !== '' && (
        <div className={`px-4 py-3 border-l-4 rounded-r-lg ${
          isUser ? 'border-green-500 bg-green-950/20' : `${borderColor.replace('border-', 'border-')} ${agentType === 'engineer' ? 'bg-orange-950/20' : 'bg-blue-950/20'}`
        }`}>
          <div className={`font-bold mb-2 ${isUser ? 'text-green-400' : agentColor}`}>
            {isUser ? 'You: ' : agentLabel}
          </div>
          {isUser ? (
            // User messages as plain text
            <div className="text-gray-100 whitespace-pre-wrap">{message.content}</div>
          ) : (
            // Agent messages with markdown rendering
            <div className="text-gray-100 prose prose-invert prose-sm max-w-none">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  // Custom styling for markdown elements
                  h1: ({children}) => <h1 className="text-xl font-bold text-white mb-3">{children}</h1>,
                  h2: ({children}) => <h2 className="text-lg font-bold text-white mb-2">{children}</h2>,
                  h3: ({children}) => <h3 className="text-base font-bold text-white mb-2">{children}</h3>,
                  p: ({children}) => <p className="text-gray-100 mb-2 last:mb-0">{children}</p>,
                  code: ({children, className}) => {
                    const isInline = !className
                    if (isInline) {
                      return <code className="bg-gray-800 text-orange-300 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                    }
                    return (
                      <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 overflow-x-auto my-3">
                        <code className="text-gray-300 text-sm font-mono">{children}</code>
                      </pre>
                    )
                  },
                  pre: ({children}) => <div className="my-3">{children}</div>,
                  ul: ({children}) => <ul className="list-disc list-inside text-gray-100 mb-3 space-y-1 pl-4">{children}</ul>,
                  ol: ({children}) => <ol className="list-decimal list-inside text-gray-100 mb-3 space-y-1 pl-4">{children}</ol>,
                  li: ({children}) => <li className="text-gray-100">{children}</li>,
                  blockquote: ({children}) => (
                    <blockquote className="border-l-4 border-gray-500 pl-4 italic text-gray-300 my-3 bg-gray-800/30 py-2 rounded-r">
                      {children}
                    </blockquote>
                  ),
                  a: ({children, href}) => (
                    <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                  table: ({children}) => (
                    <div className="overflow-x-auto my-3">
                      <table className="min-w-full border border-gray-700 rounded-lg">
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
                    <td className="border border-gray-700 px-3 py-2 text-gray-100">
                      {children}
                    </td>
                  ),
                  strong: ({children}) => <strong className="font-bold text-white">{children}</strong>,
                  em: ({children}) => <em className="italic text-gray-200">{children}</em>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
      
      {/* Tool calls - enhanced visual separation and handling */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className={`${message.content.trim() !== '' ? 'ml-6' : ''} space-y-2`}>
          {/* Header for multiple tool calls */}
          {message.toolCalls.length > 1 && (
            <div className="text-gray-400 text-sm font-medium border-b border-gray-700 pb-2 mb-3 flex items-center gap-2">
              <span className="text-lg">🔧</span>
              <span>{message.toolCalls.length} tool calls:</span>
            </div>
          )}
          
          {/* Individual tool calls */}
          {message.toolCalls.map((toolCall) => (
            <ToolCallComponent key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      )}
      
      {/* Show typing indicator for empty assistant messages without tool calls */}
      {message.role === 'assistant' && message.content === '' && (!message.toolCalls || message.toolCalls.length === 0) && (
        <div className={`px-4 py-3 border-l-4 rounded-r-lg ${borderColor.replace('border-', 'border-')} ${agentType === 'engineer' ? 'bg-orange-950/20' : 'bg-blue-950/20'}`}>
          <div className={`font-bold mb-2 ${agentColor}`}>
            {agentLabel}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 animate-pulse">▊</span>
            <span className="text-gray-400 text-sm animate-pulse">thinking...</span>
          </div>
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
    console.log('[ChatPanel] messages updated:', messages.length, 'msgs')
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
      <div className="px-6 py-4 border-b border-gray-700 flex items-center gap-3 bg-gray-900/50">
        <span className={`text-lg ${isEngineer ? 'text-orange-500' : 'text-green-500'}`}>●</span>
        <span className="text-white font-bold text-lg">{agentName}</span>
        <span className="text-gray-400">-</span>
        <span className="text-gray-400">{agentSubtitle}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="text-gray-500 text-center py-12">
            <div className="text-6xl mb-4">{isEngineer ? '🔧' : '💡'}</div>
            <div className="text-lg mb-2">
              {isEngineer 
                ? 'Engineer thread will show conversation and tool usage...'
                : 'Start by describing an idea or feature you want to build...'}
            </div>
            <div className="text-sm text-gray-600">
              {isEngineer 
                ? 'Tool calls will be visually distinct and easy to understand'
                : 'Your ideas will be analyzed and refined through conversation'}
            </div>
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
      <form onSubmit={handleSubmit} className="p-6 border-t border-gray-700 bg-gray-900/30">
        <div className="border border-gray-600 rounded-lg bg-gray-900 focus-within:border-gray-500 focus-within:ring-1 focus-within:ring-gray-500">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isEngineer ? 'Message the engineer...' : 'Describe your idea...'}
            disabled={isStreaming}
            className="w-full p-4 bg-transparent text-white placeholder-gray-500 resize-none focus:outline-none min-h-[60px] max-h-[200px]"
            rows={2}
          />
          <div className="flex justify-between items-center px-4 py-2 border-t border-gray-700">
            <div className="text-xs text-gray-500">
              {isStreaming ? 'Sending...' : 'Press Enter to send, Shift+Enter for new line'}
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {isStreaming ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
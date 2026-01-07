import { useState, useRef, useEffect } from 'react'
import { useAgentStore } from '../stores/useAgentStore'
import type { ChatMessage } from '../types'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ToolCallDisplay } from './ToolCallDisplay'

function Message({ message, agentType }: { message: ChatMessage; agentType: 'visionary' | 'engineer' }) {
  const isUser = message.role === 'user'
  const agentLabel = agentType === 'engineer' ? 'Engineer' : 'Visionary'
  const agentColor = agentType === 'engineer' ? 'text-orange-500' : 'text-blue-500'
  const borderColor = agentType === 'engineer' ? 'border-orange-500' : 'border-blue-500'
  
  // Use parts if available, otherwise fall back to content
  const hasParts = message.parts && message.parts.length > 0
  const hasContent = message.content && message.content.trim().length > 0
  
  return (
    <div className={`px-4 py-3 border-l-2 ${
      isUser ? 'border-green-500' : borderColor
    }`}>
      <div className={`font-bold mb-2 ${isUser ? 'text-green-500' : agentColor}`}>
        {isUser ? 'You' : agentLabel}
      </div>
      
      {/* Render parts in order for interleaved content */}
      {!isUser && hasParts ? (
        <div className="space-y-2">
          {message.parts!.map((part, index) => {
            if (part.type === 'text') {
              return part.content.trim() ? (
                <MarkdownRenderer key={index} content={part.content} />
              ) : null
            } else if (part.type === 'tool-call') {
              return (
                <ToolCallDisplay key={part.toolCall.id} toolCall={part.toolCall} />
              )
            }
            return null
          })}
        </div>
      ) : hasContent ? (
        <div className="space-y-0">
          <MarkdownRenderer content={message.content} />
        </div>
      ) : !isUser ? (
        <span className="text-yellow-400 animate-pulse">Thinking...</span>
      ) : null}
    </div>
  )
}

export function ChatPanel() {
  // Use individual selectors for better reactivity
  const messages = useAgentStore(state => state.messages)
  const sendMessage = useAgentStore(state => state.sendMessage)
  const abortStream = useAgentStore(state => state.abortStream)
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
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#333] flex items-center gap-2">
        <span className={isEngineer ? 'text-orange-500' : 'text-green-500'}>●</span>
        <span className="text-white font-bold">{agentName}</span>
        <span className="text-gray-500">- {agentSubtitle}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
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
          <div className="flex justify-end gap-2 px-2 pb-2">
            {isStreaming && (
              <button
                type="button"
                onClick={abortStream}
                className="px-4 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
              >
                Stop
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="px-4 py-1 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              {isStreaming ? 'Working...' : 'Send'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
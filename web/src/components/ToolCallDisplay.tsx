import { useState } from 'react'
import type { ToolCall } from '../types'

// Tool icons/emojis based on tool name
const getToolIcon = (toolName: string): string => {
  const icons: Record<string, string> = {
    // Git tools
    'setup-worktree': '🌳',
    'cleanup-worktree': '🧹',
    'git-status': '📊',
    'git-commit': '💾',
    'git-push': '⬆️',
    'git-pull': '⬇️',
    'git-fetch': '🔄',
    'git-diff': '📝',
    // File tools
    'read-file': '📖',
    'write-file': '✏️',
    'list-directory': '📁',
    'search-files': '🔍',
    // GitHub tools
    'get-issue': '🎫',
    'update-issue': '📋',
    'add-issue-comment': '💬',
    'create-pull-request': '🔀',
    'link-pr-to-issue': '🔗',
    // NPM tools
    'npm-install': '📦',
    'npm-uninstall': '🗑️',
    'npm-run': '▶️',
  }
  return icons[toolName] || '🔧'
}

// Format tool name for display
const formatToolName = (toolName: string): string => {
  return toolName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Truncate long values
const truncate = (value: string, maxLength: number = 100): string => {
  if (value.length <= maxLength) return value
  return value.slice(0, maxLength) + '...'
}



interface ToolCallDisplayProps {
  toolCall: ToolCall
  compact?: boolean
}

export function ToolCallDisplay({ toolCall, compact = false }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false)
  
  const icon = getToolIcon(toolCall.name)
  const displayName = formatToolName(toolCall.name)
  const isComplete = toolCall.status === 'complete'
  const isError = toolCall.status === 'error'
  const isCalling = toolCall.status === 'calling'
  
  // Get status indicator
  const statusIndicator = isCalling 
    ? '⏳' 
    : isError 
      ? '❌' 
      : '✅'
  
  // Get key info from input to show inline
  const getInlineInfo = (): string => {
    if (!toolCall.input) return ''
    
    // Show relevant info based on tool type
    if (toolCall.name === 'read-file' || toolCall.name === 'write-file') {
      return toolCall.input.path || ''
    }
    if (toolCall.name === 'git-commit') {
      return toolCall.input.message ? `"${truncate(toolCall.input.message, 40)}"` : ''
    }
    if (toolCall.name === 'create-pull-request') {
      return toolCall.input.title ? `"${truncate(toolCall.input.title, 40)}"` : ''
    }
    if (toolCall.name === 'search-files') {
      return toolCall.input.pattern ? `"${toolCall.input.pattern}"` : ''
    }
    if (toolCall.name === 'npm-install' && toolCall.input.packages) {
      return Array.isArray(toolCall.input.packages) 
        ? toolCall.input.packages.join(', ')
        : ''
    }
    if (toolCall.name === 'npm-run') {
      return toolCall.input.script || ''
    }
    
    return ''
  }
  
  const inlineInfo = getInlineInfo()
  
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
        isCalling 
          ? 'bg-yellow-900/50 text-yellow-300' 
          : isError 
            ? 'bg-red-900/50 text-red-300'
            : 'bg-green-900/50 text-green-300'
      }`}>
        <span>{icon}</span>
        <span>{displayName}</span>
        {inlineInfo && <span className="text-gray-400 ml-1">{inlineInfo}</span>}
        <span>{statusIndicator}</span>
      </span>
    )
  }
  
  return (
    <div className={`border rounded-lg overflow-hidden my-2 ${
      isCalling 
        ? 'border-yellow-700 bg-yellow-950/30' 
        : isError 
          ? 'border-red-700 bg-red-950/30'
          : 'border-green-700 bg-green-950/30'
    }`}>
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
      >
        <span className="text-lg">{icon}</span>
        <span className={`font-medium ${
          isCalling ? 'text-yellow-300' : isError ? 'text-red-300' : 'text-green-300'
        }`}>
          {displayName}
        </span>
        {inlineInfo && (
          <span className="text-gray-400 text-sm truncate flex-1">{inlineInfo}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {isCalling && (
            <span className="animate-pulse text-yellow-400 text-sm">Running...</span>
          )}
          <span>{statusIndicator}</span>
          <span className="text-gray-500 text-sm">{expanded ? '▼' : '▶'}</span>
        </span>
      </button>
      
      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-700 px-3 py-2 space-y-2 text-sm">
          {/* Input */}
          {toolCall.input && Object.keys(toolCall.input).length > 0 && (
            <div>
              <div className="text-gray-400 text-xs uppercase mb-1">Input</div>
              <pre className="bg-black/30 rounded p-2 overflow-x-auto text-gray-300 text-xs">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}
          
          {/* Output */}
          {isComplete && toolCall.output !== undefined && (
            <div>
              <div className="text-gray-400 text-xs uppercase mb-1">Output</div>
              <pre className="bg-black/30 rounded p-2 overflow-x-auto text-gray-300 text-xs max-h-48 overflow-y-auto">
                {typeof toolCall.output === 'string' 
                  ? toolCall.output 
                  : JSON.stringify(toolCall.output, null, 2)}
              </pre>
            </div>
          )}
          
          {/* Error */}
          {isError && toolCall.error && (
            <div>
              <div className="text-red-400 text-xs uppercase mb-1">Error</div>
              <pre className="bg-red-950/50 rounded p-2 overflow-x-auto text-red-300 text-xs">
                {toolCall.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Component to render multiple tool calls
interface ToolCallsListProps {
  toolCalls: ToolCall[]
  compact?: boolean
}

export function ToolCallsList({ toolCalls, compact = false }: ToolCallsListProps) {
  if (!toolCalls || toolCalls.length === 0) return null
  
  if (compact) {
    return (
      <div className="flex flex-wrap gap-1 my-2">
        {toolCalls.map(tc => (
          <ToolCallDisplay key={tc.id} toolCall={tc} compact />
        ))}
      </div>
    )
  }
  
  return (
    <div className="space-y-1 my-2">
      {toolCalls.map(tc => (
        <ToolCallDisplay key={tc.id} toolCall={tc} />
      ))}
    </div>
  )
}

import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ToolCall } from '../types'

interface ToolCallComponentProps {
  toolCall: ToolCall
}

export function ToolCallComponent({ toolCall }: ToolCallComponentProps) {
  const [expanded, setExpanded] = useState(false)
  
  // Memoize status-related computations for better performance
  const statusInfo = useMemo(() => {
    const status = toolCall.status
    switch (status) {
      case "calling":
        return { color: "text-yellow-400", text: "calling...", icon: "⏳", pulse: true }
      case "complete":
        return { color: "text-green-400", text: "complete", icon: "✅", pulse: false }
      case "error":
        return { color: "text-red-400", text: "error", icon: "❌", pulse: false }
      default:
        return { color: "text-gray-400", text: "unknown", icon: "❓", pulse: false }
    }
  }, [toolCall.status])
  
  // Memoize JSON formatting for better performance
  const formatJson = useMemo(() => {
    return (obj: any): string => {
      if (!obj) return ""
      try {
        // If it's already a string, return as-is
        if (typeof obj === 'string') return obj
        
        // For objects, format as JSON with proper indentation
        const formatted = JSON.stringify(obj, null, 2)
        
        // Limit very long outputs to prevent UI issues
        if (formatted.length > 1000) {
          return formatted.substring(0, 1000) + "\\n... (truncated)"
        }
        
        return formatted
      } catch {
        return String(obj)
      }
    }
  }, [])
  
  // Check if content looks like markdown
  const isMarkdown = useMemo(() => {
    return (content: string): boolean => {
      if (!content || typeof content !== 'string') return false
      // Simple heuristics for markdown detection
      return content.includes('```') || 
             content.includes('##') || 
             content.includes('- ') ||
             content.includes('* ') ||
             content.includes('[') && content.includes('](') ||
             content.includes('**') ||
             content.includes('`')
    }
  }, [])
  
  // Memoize content checks for better performance
  const contentInfo = useMemo(() => {
    const hasInput = toolCall.input && Object.keys(toolCall.input).length > 0
    const hasOutput = toolCall.output !== undefined && toolCall.output !== null
    const hasError = toolCall.error !== undefined
    
    // Auto-expand logic - expand errors immediately, keep others collapsed by default
    let shouldAutoExpand = false
    if (hasError) {
      shouldAutoExpand = true
    } else {
      // Auto-expand if input/output is very short (less than 100 chars total)
      const inputStr = hasInput ? formatJson(toolCall.input) : ""
      const outputStr = hasOutput ? formatJson(toolCall.output) : ""
      shouldAutoExpand = (inputStr.length + outputStr.length) < 100
    }
    
    return { hasInput, hasOutput, hasError, shouldAutoExpand }
  }, [toolCall.input, toolCall.output, toolCall.error, formatJson])
  
  // Initialize expansion state based on content
  useState(() => {
    if (contentInfo.shouldAutoExpand) {
      setExpanded(true)
    }
  })
  
  const toggleExpanded = () => {
    setExpanded(!expanded)
  }
  
  // Enhanced border color logic with better visual distinction
  const borderColor = useMemo(() => {
    if (toolCall.status === "error") return "border-red-500"
    if (toolCall.status === "complete") return "border-green-600"
    if (toolCall.status === "calling") return "border-yellow-500"
    return "border-gray-600"
  }, [toolCall.status])
  
  // Enhanced background color for better visual distinction
  const backgroundColor = useMemo(() => {
    if (toolCall.status === "error") return "bg-red-950/30"
    if (toolCall.status === "calling") return "bg-yellow-950/30"
    if (toolCall.status === "complete") return "bg-green-950/30"
    return "bg-gray-900/50"
  }, [toolCall.status])
  
  // Tool name with better formatting
  const displayName = useMemo(() => {
    const name = toolCall.name
    // Convert camelCase to readable format
    return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
  }, [toolCall.name])
  
  // Check if there's any expandable content
  const hasExpandableContent = useMemo(() => {
    return contentInfo.hasInput || contentInfo.hasOutput || contentInfo.hasError
  }, [contentInfo])
  
  // Render content with markdown support
  const renderContent = (content: any, isError = false) => {
    const stringContent = formatJson(content)
    
    if (isMarkdown(stringContent)) {
      return (
        <div className={`prose prose-invert prose-sm max-w-none ${isError ? 'prose-red' : ''}`}>
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({children}) => <h1 className={`text-sm font-bold mb-1 ${isError ? 'text-red-300' : 'text-gray-300'}`}>{children}</h1>,
              h2: ({children}) => <h2 className={`text-sm font-bold mb-1 ${isError ? 'text-red-300' : 'text-gray-300'}`}>{children}</h2>,
              h3: ({children}) => <h3 className={`text-xs font-bold mb-1 ${isError ? 'text-red-300' : 'text-gray-300'}`}>{children}</h3>,
              p: ({children}) => <p className={`text-xs mb-1 last:mb-0 ${isError ? 'text-red-300' : 'text-gray-300'}`}>{children}</p>,
              code: ({children, className}) => {
                const isInline = !className
                if (isInline) {
                  return <code className={`px-1 py-0.5 rounded text-xs font-mono ${isError ? 'bg-red-900 text-red-200' : 'bg-gray-800 text-orange-300'}`}>{children}</code>
                }
                return (
                  <pre className={`border rounded p-2 overflow-x-auto my-1 ${isError ? 'bg-red-950 border-red-700' : 'bg-gray-950 border-gray-700'}`}>
                    <code className={`text-xs font-mono ${isError ? 'text-red-200' : 'text-gray-300'}`}>{children}</code>
                  </pre>
                )
              },
              pre: ({children}) => <div className="my-1">{children}</div>,
              ul: ({children}) => <ul className={`list-disc list-inside mb-1 space-y-0.5 ${isError ? 'text-red-300' : 'text-gray-300'}`}>{children}</ul>,
              ol: ({children}) => <ol className={`list-decimal list-inside mb-1 space-y-0.5 ${isError ? 'text-red-300' : 'text-gray-300'}`}>{children}</ol>,
              li: ({children}) => <li className={`text-xs ${isError ? 'text-red-300' : 'text-gray-300'}`}>{children}</li>,
              blockquote: ({children}) => (
                <blockquote className={`border-l-2 pl-2 italic my-1 ${isError ? 'border-red-500 text-red-400' : 'border-gray-500 text-gray-400'}`}>
                  {children}
                </blockquote>
              ),
              a: ({children, href}) => (
                <a href={href} className={`underline ${isError ? 'text-red-400 hover:text-red-300' : 'text-blue-400 hover:text-blue-300'}`} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              strong: ({children}) => <strong className={`font-bold ${isError ? 'text-red-300' : 'text-gray-300'}`}>{children}</strong>,
              em: ({children}) => <em className={`italic ${isError ? 'text-red-300' : 'text-gray-300'}`}>{children}</em>,
            }}
          >
            {stringContent}
          </ReactMarkdown>
        </div>
      )
    }
    
    // Fallback to preformatted text
    return (
      <pre className={`text-xs whitespace-pre-wrap font-mono ${isError ? 'text-red-300' : 'text-gray-300'}`}>
        {stringContent}
      </pre>
    )
  }
  
  return (
    <div className={`border ${borderColor} rounded-lg p-3 my-2 ${backgroundColor}`}>
      {/* Tool header - always visible with enhanced styling */}
      <div 
        className={`flex items-center gap-2 rounded p-1 -m-1 ${
          hasExpandableContent ? 'cursor-pointer hover:bg-gray-800/50' : 'cursor-default'
        }`}
        onClick={hasExpandableContent ? toggleExpanded : undefined}
      >
        <span className="text-gray-400">🔧</span>
        <span className="text-white font-bold">{displayName}</span>
        <span className="text-gray-500">•</span>
        <span className={`${statusInfo.color} ${statusInfo.pulse ? 'animate-pulse' : ''}`}>
          {statusInfo.icon} {statusInfo.text}
        </span>
        {hasExpandableContent && (
          <span className="text-gray-500 ml-auto">
            {expanded ? "▼" : "▶"}
          </span>
        )}
      </div>
      
      {/* Expandable details with improved layout */}
      {expanded && hasExpandableContent && (
        <div className="mt-3 space-y-3">
          {/* Input section with better formatting */}
          {contentInfo.hasInput && (
            <div>
              <div className="text-gray-400 font-bold mb-1 flex items-center gap-1">
                📥 Input:
              </div>
              <div className="border-l-2 border-gray-600 pl-3 ml-2 bg-gray-950/50 rounded-r p-2">
                {renderContent(toolCall.input)}
              </div>
            </div>
          )}
          
          {/* Output section with better formatting */}
          {contentInfo.hasOutput && (
            <div>
              <div className="text-gray-400 font-bold mb-1 flex items-center gap-1">
                📤 Output:
              </div>
              <div className="border-l-2 border-gray-600 pl-3 ml-2 bg-gray-950/50 rounded-r p-2">
                {renderContent(toolCall.output)}
              </div>
            </div>
          )}
          
          {/* Error section with enhanced visibility */}
          {contentInfo.hasError && (
            <div>
              <div className="text-red-400 font-bold mb-1 flex items-center gap-1">
                ❌ Error:
              </div>
              <div className="border-l-2 border-red-500 pl-3 ml-2 bg-red-950/50 rounded-r p-2">
                {renderContent(toolCall.error, true)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
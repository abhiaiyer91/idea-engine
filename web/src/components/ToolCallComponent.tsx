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
        return { 
          color: "text-amber-400", 
          bgColor: "bg-amber-950/30", 
          borderColor: "border-amber-500",
          text: "calling...", 
          icon: "⏳", 
          pulse: true 
        }
      case "complete":
        return { 
          color: "text-emerald-400", 
          bgColor: "bg-emerald-950/30", 
          borderColor: "border-emerald-500",
          text: "complete", 
          icon: "✅", 
          pulse: false 
        }
      case "error":
        return { 
          color: "text-red-400", 
          bgColor: "bg-red-950/30", 
          borderColor: "border-red-500",
          text: "error", 
          icon: "❌", 
          pulse: false 
        }
      default:
        return { 
          color: "text-gray-400", 
          bgColor: "bg-gray-900/50", 
          borderColor: "border-gray-600",
          text: "unknown", 
          icon: "❓", 
          pulse: false 
        }
    }
  }, [toolCall.status])
  
  // Get appropriate icon for tool type
  const getToolIcon = useMemo(() => {
    const name = toolCall.name.toLowerCase()
    if (name.includes('file') || name.includes('read') || name.includes('write')) return "📄"
    if (name.includes('git') || name.includes('commit') || name.includes('push')) return "🔀"
    if (name.includes('search') || name.includes('find')) return "🔍"
    if (name.includes('issue') || name.includes('github')) return "🐛"
    if (name.includes('npm') || name.includes('install')) return "📦"
    if (name.includes('test') || name.includes('run')) return "🧪"
    if (name.includes('build') || name.includes('compile')) return "🔨"
    if (name.includes('create') || name.includes('setup')) return "🏗️"
    if (name.includes('list') || name.includes('directory')) return "📁"
    if (name.includes('pull') || name.includes('fetch')) return "⬇️"
    if (name.includes('diff') || name.includes('status')) return "📊"
    return "🔧"
  }, [toolCall.name])
  
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
        if (formatted.length > 2000) {
          return formatted.substring(0, 2000) + "\\n... (truncated)"
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
      // Auto-expand if input/output is very short (less than 150 chars total)
      const inputStr = hasInput ? formatJson(toolCall.input) : ""
      const outputStr = hasOutput ? formatJson(toolCall.output) : ""
      shouldAutoExpand = (inputStr.length + outputStr.length) < 150
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
  const renderContent = (content: any, isError = false, isInput = false) => {
    const stringContent = formatJson(content)
    
    if (isMarkdown(stringContent)) {
      return (
        <div className={`prose prose-invert prose-sm max-w-none ${isError ? 'prose-red' : isInput ? 'prose-blue' : 'prose-green'}`}>
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({children}) => <h1 className={`text-sm font-bold mb-1 ${isError ? 'text-red-300' : isInput ? 'text-blue-300' : 'text-emerald-300'}`}>{children}</h1>,
              h2: ({children}) => <h2 className={`text-sm font-bold mb-1 ${isError ? 'text-red-300' : isInput ? 'text-blue-300' : 'text-emerald-300'}`}>{children}</h2>,
              h3: ({children}) => <h3 className={`text-xs font-bold mb-1 ${isError ? 'text-red-300' : isInput ? 'text-blue-300' : 'text-emerald-300'}`}>{children}</h3>,
              p: ({children}) => <p className={`text-xs mb-1 last:mb-0 ${isError ? 'text-red-200' : isInput ? 'text-blue-200' : 'text-emerald-200'}`}>{children}</p>,
              code: ({children, className}) => {
                const isInline = !className
                if (isInline) {
                  return <code className={`px-1 py-0.5 rounded text-xs font-mono ${
                    isError ? 'bg-red-900 text-red-200' : 
                    isInput ? 'bg-blue-900 text-blue-200' : 
                    'bg-emerald-900 text-emerald-200'
                  }`}>{children}</code>
                }
                return (
                  <pre className={`border rounded p-2 overflow-x-auto my-1 ${
                    isError ? 'bg-red-950 border-red-700' : 
                    isInput ? 'bg-blue-950 border-blue-700' : 
                    'bg-emerald-950 border-emerald-700'
                  }`}>
                    <code className={`text-xs font-mono ${
                      isError ? 'text-red-200' : 
                      isInput ? 'text-blue-200' : 
                      'text-emerald-200'
                    }`}>{children}</code>
                  </pre>
                )
              },
              pre: ({children}) => <div className="my-1">{children}</div>,
              ul: ({children}) => <ul className={`list-disc list-inside mb-1 space-y-0.5 ${isError ? 'text-red-200' : isInput ? 'text-blue-200' : 'text-emerald-200'}`}>{children}</ul>,
              ol: ({children}) => <ol className={`list-decimal list-inside mb-1 space-y-0.5 ${isError ? 'text-red-200' : isInput ? 'text-blue-200' : 'text-emerald-200'}`}>{children}</ol>,
              li: ({children}) => <li className={`text-xs ${isError ? 'text-red-200' : isInput ? 'text-blue-200' : 'text-emerald-200'}`}>{children}</li>,
              blockquote: ({children}) => (
                <blockquote className={`border-l-2 pl-2 italic my-1 ${
                  isError ? 'border-red-500 text-red-300' : 
                  isInput ? 'border-blue-500 text-blue-300' : 
                  'border-emerald-500 text-emerald-300'
                }`}>
                  {children}
                </blockquote>
              ),
              a: ({children, href}) => (
                <a href={href} className={`underline ${
                  isError ? 'text-red-400 hover:text-red-300' : 
                  isInput ? 'text-blue-400 hover:text-blue-300' : 
                  'text-emerald-400 hover:text-emerald-300'
                }`} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              strong: ({children}) => <strong className={`font-bold ${isError ? 'text-red-200' : isInput ? 'text-blue-200' : 'text-emerald-200'}`}>{children}</strong>,
              em: ({children}) => <em className={`italic ${isError ? 'text-red-200' : isInput ? 'text-blue-200' : 'text-emerald-200'}`}>{children}</em>,
            }}
          >
            {stringContent}
          </ReactMarkdown>
        </div>
      )
    }
    
    // Fallback to preformatted text
    return (
      <pre className={`text-xs whitespace-pre-wrap font-mono ${
        isError ? 'text-red-200' : 
        isInput ? 'text-blue-200' : 
        'text-emerald-200'
      }`}>
        {stringContent}
      </pre>
    )
  }
  
  return (
    <div className={`border ${statusInfo.borderColor} rounded-lg p-3 my-2 ${statusInfo.bgColor} transition-all duration-200`}>
      {/* Tool header - always visible with enhanced styling */}
      <div 
        className={`flex items-center gap-2 rounded p-1 -m-1 transition-colors ${
          hasExpandableContent ? 'cursor-pointer hover:bg-gray-800/50' : 'cursor-default'
        }`}
        onClick={hasExpandableContent ? toggleExpanded : undefined}
      >
        <span className="text-gray-400 text-lg">{getToolIcon}</span>
        <span className="text-white font-bold text-sm">{displayName}</span>
        <span className="text-gray-500">•</span>
        <span className={`${statusInfo.color} ${statusInfo.pulse ? 'animate-pulse' : ''} text-sm flex items-center gap-1`}>
          <span>{statusInfo.icon}</span>
          <span>{statusInfo.text}</span>
        </span>
        {hasExpandableContent && (
          <span className="text-gray-500 ml-auto text-sm">
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
              <div className="text-blue-400 font-bold mb-2 flex items-center gap-2 text-sm">
                <span>📥</span>
                <span>Input:</span>
              </div>
              <div className="border-l-4 border-blue-500 pl-4 ml-2 bg-blue-950/20 rounded-r p-3">
                {renderContent(toolCall.input, false, true)}
              </div>
            </div>
          )}
          
          {/* Output section with better formatting */}
          {contentInfo.hasOutput && (
            <div>
              <div className="text-emerald-400 font-bold mb-2 flex items-center gap-2 text-sm">
                <span>📤</span>
                <span>Output:</span>
              </div>
              <div className="border-l-4 border-emerald-500 pl-4 ml-2 bg-emerald-950/20 rounded-r p-3">
                {renderContent(toolCall.output, false, false)}
              </div>
            </div>
          )}
          
          {/* Error section with enhanced visibility */}
          {contentInfo.hasError && (
            <div>
              <div className="text-red-400 font-bold mb-2 flex items-center gap-2 text-sm">
                <span>❌</span>
                <span>Error:</span>
              </div>
              <div className="border-l-4 border-red-500 pl-4 ml-2 bg-red-950/20 rounded-r p-3">
                {renderContent(toolCall.error, true, false)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
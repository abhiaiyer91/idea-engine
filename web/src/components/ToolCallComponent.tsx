import { useState, useMemo } from 'react'
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
        return { color: "text-yellow-400", text: "calling...", icon: "⏳" }
      case "complete":
        return { color: "text-green-400", text: "complete", icon: "✅" }
      case "error":
        return { color: "text-red-400", text: "error", icon: "❌" }
      default:
        return { color: "text-gray-400", text: "unknown", icon: "❓" }
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
  
  // Memoize content checks for better performance
  const contentInfo = useMemo(() => {
    const hasInput = toolCall.input && Object.keys(toolCall.input).length > 0
    const hasOutput = toolCall.output !== undefined && toolCall.output !== null
    const hasError = toolCall.error !== undefined
    
    // Auto-expand logic
    let shouldAutoExpand = false
    if (hasError) {
      shouldAutoExpand = true
    } else {
      // Auto-expand if input/output is short
      const inputStr = hasInput ? formatJson(toolCall.input) : ""
      const outputStr = hasOutput ? formatJson(toolCall.output) : ""
      shouldAutoExpand = (inputStr.length + outputStr.length) < 200
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
  
  // Enhanced border color logic
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
    return "bg-gray-900/50"
  }, [toolCall.status])
  
  return (
    <div className={`border ${borderColor} rounded-lg p-3 my-2 ${backgroundColor}`}>
      {/* Tool header - always visible */}
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 rounded p-1 -m-1"
        onClick={toggleExpanded}
      >
        <span className="text-gray-400">🔧</span>
        <span className="text-white font-bold">{toolCall.name}</span>
        <span className="text-gray-500">-</span>
        <span className={statusInfo.color}>
          {statusInfo.icon} {statusInfo.text}
        </span>
        {(contentInfo.hasInput || contentInfo.hasOutput || contentInfo.hasError) && (
          <span className="text-gray-500 ml-auto">
            {expanded ? "▼" : "▶"}
          </span>
        )}
      </div>
      
      {/* Expandable details */}
      {expanded && (contentInfo.hasInput || contentInfo.hasOutput || contentInfo.hasError) && (
        <div className="mt-3 space-y-3">
          {/* Input section */}
          {contentInfo.hasInput && (
            <div>
              <div className="text-gray-400 font-bold mb-1">Input:</div>
              <div className="border-l-2 border-gray-600 pl-3 ml-2">
                <pre className="text-gray-300 text-sm whitespace-pre-wrap font-mono">
                  {formatJson(toolCall.input)}
                </pre>
              </div>
            </div>
          )}
          
          {/* Output section */}
          {contentInfo.hasOutput && (
            <div>
              <div className="text-gray-400 font-bold mb-1">Output:</div>
              <div className="border-l-2 border-gray-600 pl-3 ml-2">
                <pre className="text-gray-300 text-sm whitespace-pre-wrap font-mono">
                  {formatJson(toolCall.output)}
                </pre>
              </div>
            </div>
          )}
          
          {/* Error section */}
          {contentInfo.hasError && (
            <div>
              <div className="text-red-400 font-bold mb-1">Error:</div>
              <div className="border-l-2 border-red-500 pl-3 ml-2">
                <pre className="text-red-300 text-sm whitespace-pre-wrap font-mono">
                  {toolCall.error}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
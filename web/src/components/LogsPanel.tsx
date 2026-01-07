import { useState, useRef, useEffect } from 'react'
import { useAgentStore, type ToolCallLog } from '../stores/useAgentStore'

function ToolCallItem({ toolCall }: { toolCall: ToolCallLog }) {
  const [expanded, setExpanded] = useState(false)
  
  const statusColors: Record<string, string> = {
    calling: 'text-yellow-500',
    complete: 'text-green-500',
    error: 'text-red-500',
  }
  
  const statusIcons: Record<string, string> = {
    calling: '...',
    complete: 'ok',
    error: '!!',
  }
  
  const borderColors: Record<string, string> = {
    calling: 'border-yellow-500/50',
    complete: 'border-green-500/30',
    error: 'border-red-500/50',
  }

  const hasDetails = toolCall.args || toolCall.result || toolCall.error
  
  // Auto-expand errors
  useEffect(() => {
    if (toolCall.status === 'error') {
      setExpanded(true)
    }
  }, [toolCall.status])

  const formatValue = (value: unknown): string => {
    if (value === undefined || value === null) return ''
    if (typeof value === 'string') {
      return value.length > 300 ? value.slice(0, 300) + '...' : value
    }
    try {
      const str = JSON.stringify(value, null, 2)
      return str.length > 500 ? str.slice(0, 500) + '...' : str
    } catch {
      return String(value)
    }
  }

  return (
    <div className={`border-l-2 ${borderColors[toolCall.status]} bg-[#1a1a1a] rounded-r`}>
      <div 
        className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-[#222]"
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <span className="text-gray-500 font-mono text-xs">
          {toolCall.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <span className="text-gray-400">$</span>
        <span className="text-blue-400 font-mono text-sm">{toolCall.toolName}</span>
        <span className={`${statusColors[toolCall.status]} text-xs font-mono`}>
          [{statusIcons[toolCall.status]}]
        </span>
        {hasDetails && (
          <span className="text-gray-600 text-xs ml-auto">
            {expanded ? 'v' : '>'}
          </span>
        )}
      </div>
      
      {expanded && hasDetails && (
        <div className="px-3 pb-2 text-xs font-mono space-y-2">
          {toolCall.args && Object.keys(toolCall.args).length > 0 && (
            <div>
              <div className="text-gray-500 mb-1">args:</div>
              <pre className="text-gray-400 pl-2 border-l border-gray-700 whitespace-pre-wrap overflow-x-auto">
                {formatValue(toolCall.args)}
              </pre>
            </div>
          )}
          {toolCall.result !== undefined && (
            <div>
              <div className="text-gray-500 mb-1">result:</div>
              <pre className="text-green-400/70 pl-2 border-l border-green-700/50 whitespace-pre-wrap overflow-x-auto">
                {formatValue(toolCall.result)}
              </pre>
            </div>
          )}
          {toolCall.error && (
            <div>
              <div className="text-red-500 mb-1">error:</div>
              <pre className="text-red-400 pl-2 border-l border-red-700 whitespace-pre-wrap">
                {toolCall.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function LogsPanel() {
  const { logs, clearLogs } = useAgentStore()
  const logsEndRef = useRef<HTMLDivElement>(null)
  
  // Auto-scroll to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="w-96 border-l border-[#333] flex flex-col h-full bg-[#0a0a0a]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#333] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-green-500">&gt;</span>
          <span className="text-white font-bold">LOGS</span>
          <span className="text-gray-500 text-sm">({logs.length})</span>
        </div>
        {logs.length > 0 && (
          <button
            onClick={clearLogs}
            className="text-xs text-gray-500 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>
      
      {/* Logs List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {logs.length === 0 ? (
          <div className="text-gray-600 text-sm p-2">
            Tool calls and events will appear here...
          </div>
        ) : (
          logs.map((log) => (
            log.toolCall ? (
              <ToolCallItem key={log.id} toolCall={log.toolCall} />
            ) : (
              <div key={log.id} className="flex items-start gap-2 px-2 py-1 text-sm">
                <span className="text-gray-600 font-mono text-xs shrink-0">
                  {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className={`${log.type === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                  {log.message}
                </span>
              </div>
            )
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  )
}

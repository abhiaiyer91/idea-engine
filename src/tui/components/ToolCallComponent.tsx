import { createSignal, createMemo, Show, For } from "solid-js"
import type { ToolCall } from "../App.js"

type ToolCallComponentProps = {
  toolCall: ToolCall
}

export function ToolCallComponent(props: ToolCallComponentProps) {
  const [expanded, setExpanded] = createSignal(false)
  
  // Memoize status-related computations for better performance
  const statusInfo = createMemo(() => {
    const status = props.toolCall.status
    switch (status) {
      case "calling":
        return { color: "#ffff00", text: "calling...", icon: "⏳", pulse: true }
      case "complete":
        return { color: "#00ff00", text: "complete", icon: "✅", pulse: false }
      case "error":
        return { color: "#ff0000", text: "error", icon: "❌", pulse: false }
      default:
        return { color: "#666", text: "unknown", icon: "❓", pulse: false }
    }
  })
  
  // Memoize JSON formatting for better performance
  const formatJson = createMemo(() => {
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
  })
  
  // Memoize content checks for better performance
  const contentInfo = createMemo(() => {
    const hasInput = props.toolCall.input && Object.keys(props.toolCall.input).length > 0
    const hasOutput = props.toolCall.output !== undefined && props.toolCall.output !== null
    const hasError = props.toolCall.error !== undefined
    
    // Auto-expand logic - expand errors immediately, keep others collapsed by default
    let shouldAutoExpand = false
    if (hasError) {
      shouldAutoExpand = true
    } else {
      // Auto-expand if input/output is very short (less than 100 chars total)
      const inputStr = hasInput ? formatJson()(props.toolCall.input) : ""
      const outputStr = hasOutput ? formatJson()(props.toolCall.output) : ""
      shouldAutoExpand = (inputStr.length + outputStr.length) < 100
    }
    
    return { hasInput, hasOutput, hasError, shouldAutoExpand }
  })
  
  // Initialize expansion state based on content (only once)
  const initExpanded = createMemo(() => {
    return contentInfo().shouldAutoExpand
  })
  
  // Set initial expansion state
  if (!expanded() && initExpanded()) {
    setExpanded(true)
  }
  
  const toggleExpanded = () => {
    setExpanded(!expanded())
  }
  
  // Enhanced border color logic with better visual distinction
  const borderColor = createMemo(() => {
    if (props.toolCall.status === "error") return "#ff4444"
    if (props.toolCall.status === "complete") return "#44ff44"
    if (props.toolCall.status === "calling") return "#ffaa00"
    return "#555"
  })
  
  // Enhanced background color for better visual distinction
  const backgroundColor = createMemo(() => {
    if (props.toolCall.status === "error") return "#2a1010"
    if (props.toolCall.status === "calling") return "#2a2010"
    if (props.toolCall.status === "complete") return "#102a10"
    return "#1a1a1a"
  })
  
  // Tool name with better formatting
  const displayName = createMemo(() => {
    const name = props.toolCall.name
    // Convert camelCase to readable format
    return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
  })
  
  return (
    <box 
      border 
      borderColor={borderColor()} 
      paddingLeft={2} 
      paddingRight={2} 
      paddingTop={1} 
      paddingBottom={1}
      marginTop={1}
      marginBottom={1}
      backgroundColor={backgroundColor()}
      borderStyle="round"
    >
      {/* Tool header - always visible with enhanced styling */}
      <box 
        paddingBottom={contentInfo().hasInput || contentInfo().hasOutput || contentInfo().hasError ? 1 : 0}
        onClick={toggleExpanded}
        cursor="pointer"
      >
        <text>
          {/* Tool icon with better visual hierarchy */}
          <span style={{ fg: "#888" }}>🔧 </span>
          <span style={{ fg: "#fff", bold: true }}>{displayName()}</span>
          <span style={{ fg: "#666" }}> • </span>
          
          {/* Status with enhanced visual feedback */}
          <Show 
            when={statusInfo().pulse}
            fallback={
              <span style={{ fg: statusInfo().color }}>
                {statusInfo().icon} {statusInfo().text}
              </span>
            }
          >
            <span style={{ fg: statusInfo().color, blink: true }}>
              {statusInfo().icon} {statusInfo().text}
            </span>
          </Show>
          
          {/* Expand/collapse indicator */}
          <Show when={contentInfo().hasInput || contentInfo().hasOutput || contentInfo().hasError}>
            <span style={{ fg: "#666" }}> {expanded() ? "▼" : "▶"}</span>
          </Show>
        </text>
      </box>
      
      {/* Expandable details with improved layout */}
      <Show when={expanded() && (contentInfo().hasInput || contentInfo().hasOutput || contentInfo().hasError)}>
        <box flexDirection="column">
          {/* Input section with better formatting */}
          <Show when={contentInfo().hasInput}>
            <box paddingTop={1}>
              <text style={{ fg: "#aaa", bold: true }}>📥 Input:</text>
            </box>
            <box 
              border={["left"]} 
              borderColor="#444" 
              paddingLeft={2} 
              marginLeft={1}
              marginTop={1}
              backgroundColor="#0f0f0f"
            >
              <text style={{ fg: "#ddd" }}>
                {formatJson()(props.toolCall.input)}
              </text>
            </box>
          </Show>
          
          {/* Output section with better formatting */}
          <Show when={contentInfo().hasOutput}>
            <box paddingTop={contentInfo().hasInput ? 2 : 1}>
              <text style={{ fg: "#aaa", bold: true }}>📤 Output:</text>
            </box>
            <box 
              border={["left"]} 
              borderColor="#444" 
              paddingLeft={2} 
              marginLeft={1}
              marginTop={1}
              backgroundColor="#0f0f0f"
            >
              <text style={{ fg: "#ddd" }}>
                {formatJson()(props.toolCall.output)}
              </text>
            </box>
          </Show>
          
          {/* Error section with enhanced visibility */}
          <Show when={contentInfo().hasError}>
            <box paddingTop={(contentInfo().hasInput || contentInfo().hasOutput) ? 2 : 1}>
              <text style={{ fg: "#ff6666", bold: true }}>❌ Error:</text>
            </box>
            <box 
              border={["left"]} 
              borderColor="#ff4444" 
              paddingLeft={2} 
              marginLeft={1}
              marginTop={1}
              backgroundColor="#2a0a0a"
            >
              <text style={{ fg: "#ffaaaa" }}>
                {props.toolCall.error}
              </text>
            </box>
          </Show>
        </box>
      </Show>
    </box>
  )
}
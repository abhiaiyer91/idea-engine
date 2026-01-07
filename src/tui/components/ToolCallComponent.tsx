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
        return { color: "#ffff00", text: "calling...", icon: "⏳" }
      case "complete":
        return { color: "#00ff00", text: "complete", icon: "✅" }
      case "error":
        return { color: "#ff0000", text: "error", icon: "❌" }
      default:
        return { color: "#666", text: "unknown", icon: "❓" }
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
    
    // Auto-expand logic
    let shouldAutoExpand = false
    if (hasError) {
      shouldAutoExpand = true
    } else {
      // Auto-expand if input/output is short
      const inputStr = hasInput ? formatJson()(props.toolCall.input) : ""
      const outputStr = hasOutput ? formatJson()(props.toolCall.output) : ""
      shouldAutoExpand = (inputStr.length + outputStr.length) < 200
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
  
  // Enhanced border color logic
  const borderColor = createMemo(() => {
    if (props.toolCall.status === "error") return "#ff0000"
    if (props.toolCall.status === "complete") return "#00aa00"
    if (props.toolCall.status === "calling") return "#ffaa00"
    return "#444"
  })
  
  // Enhanced background color for better visual distinction
  const backgroundColor = createMemo(() => {
    if (props.toolCall.status === "error") return "#330000"
    if (props.toolCall.status === "calling") return "#332200"
    return "#1a1a1a"
  })
  
  return (
    <box 
      border 
      borderColor={borderColor()} 
      paddingLeft={1} 
      paddingRight={1} 
      paddingTop={0} 
      paddingBottom={0}
      marginTop={1}
      marginBottom={1}
      backgroundColor={backgroundColor()}
    >
      {/* Tool header - always visible */}
      <box 
        paddingTop={1} 
        paddingBottom={1}
        onClick={toggleExpanded}
        cursor="pointer"
      >
        <text>
          <span style={{ fg: "#888" }}>🔧 </span>
          <span style={{ fg: "#fff", bold: true }}>{props.toolCall.name}</span>
          <span style={{ fg: "#666" }}> - </span>
          <span style={{ fg: statusInfo().color }}>
            {statusInfo().icon} {statusInfo().text}
          </span>
          <Show when={contentInfo().hasInput || contentInfo().hasOutput || contentInfo().hasError}>
            <span style={{ fg: "#666" }}> {expanded() ? "▼" : "▶"}</span>
          </Show>
        </text>
      </box>
      
      {/* Expandable details */}
      <Show when={expanded() && (contentInfo().hasInput || contentInfo().hasOutput || contentInfo().hasError)}>
        <box flexDirection="column" paddingBottom={1}>
          {/* Input section */}
          <Show when={contentInfo().hasInput}>
            <box paddingTop={1}>
              <text style={{ fg: "#888", bold: true }}>Input:</text>
            </box>
            <box 
              border={["left"]} 
              borderColor="#333" 
              paddingLeft={1} 
              marginLeft={1}
            >
              <text style={{ fg: "#ccc" }}>
                {formatJson()(props.toolCall.input)}
              </text>
            </box>
          </Show>
          
          {/* Output section */}
          <Show when={contentInfo().hasOutput}>
            <box paddingTop={1}>
              <text style={{ fg: "#888", bold: true }}>Output:</text>
            </box>
            <box 
              border={["left"]} 
              borderColor="#333" 
              paddingLeft={1} 
              marginLeft={1}
            >
              <text style={{ fg: "#ccc" }}>
                {formatJson()(props.toolCall.output)}
              </text>
            </box>
          </Show>
          
          {/* Error section */}
          <Show when={contentInfo().hasError}>
            <box paddingTop={1}>
              <text style={{ fg: "#ff0000", bold: true }}>Error:</text>
            </box>
            <box 
              border={["left"]} 
              borderColor="#ff0000" 
              paddingLeft={1} 
              marginLeft={1}
            >
              <text style={{ fg: "#ff8888" }}>
                {props.toolCall.error}
              </text>
            </box>
          </Show>
        </box>
      </Show>
    </box>
  )
}
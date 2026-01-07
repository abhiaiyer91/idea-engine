import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Header } from "./components/Header.js"
import { AgentList } from "./components/AgentList.js"
import { ThreadList } from "./components/ThreadList.js"
import { ChatPanel } from "./components/ChatPanel.js"
import { LogsPanel } from "./components/LogsPanel.js"
import { useAgentStore } from "./stores/agentStore.js"

export type AgentStatus = "idle" | "working" | "pr-open" | "error"

export type Agent = {
  id: string
  name: string
  type: "visionary" | "engineer"
  status: AgentStatus
  currentTask?: string
}

export type Issue = {
  number: number
  title: string
  status: "open" | "in_progress" | "closed"
  priority: "high" | "medium" | "low"
  assignee?: string
}

export type ToolCall = {
  id: string
  name: string
  status: "calling" | "complete" | "error"
  input?: Record<string, any>
  output?: any
  error?: string
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  toolCalls?: ToolCall[]
}

type View = "chat" | "logs"

export function App() {
  const store = useAgentStore()
  const [inputValue, setInputValue] = createSignal("")
  const [currentView, setCurrentView] = createSignal<View>("chat")

  // Keyboard navigation
  useKeyboard((key) => {
    // Tab to switch views
    if (key.name === "tab") {
      setCurrentView(v => v === "chat" ? "logs" : "chat")
    }
    
    // Escape to create new thread (works even when input is focused)
    if (key.name === "escape") {
      store.createNewThread()
    }
  })

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return
    setInputValue("")
    await store.sendToVisionary(value)
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <Header currentView={currentView()} />
      
      <box flexDirection="row" flexGrow={1}>
        {/* Left Panel - Agents & Threads */}
        <box flexDirection="column" width="30%" border={["right"]} borderColor="#333">
          <AgentList agents={store.agents} />
          <ThreadList 
            threads={store.threads}
            currentThreadId={store.currentThreadId()}
            onSelect={store.selectThread}
            onCreate={store.createNewThread}
          />
        </box>

        {/* Right Panel - Chat or Logs */}
        <box flexDirection="column" width="70%">
          {currentView() === "chat" ? (
            <ChatPanel 
              messages={store.messages} 
              inputValue={inputValue()}
              onInputChange={setInputValue}
              onSubmit={handleSubmit}
            />
          ) : (
            <LogsPanel />
          )}
        </box>
      </box>
    </box>
  )
}
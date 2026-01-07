import { For, Show, createSignal, createEffect } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { Thread } from "../stores/agentStore"

type ThreadListProps = {
  threads: Thread[]
  currentThreadId: string | null
  onSelect: (threadId: string) => void
  onCreate: () => void
}

function formatDate(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } else if (days === 1) {
    return "Yesterday"
  } else if (days < 7) {
    return `${days}d ago`
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" })
  }
}

export function ThreadList(props: ThreadListProps) {
  const [focusedIndex, setFocusedIndex] = createSignal(0)
  
  // Sort threads by most recent first
  const sortedThreads = () => 
    [...props.threads].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

  // Keep focused index in bounds when threads change
  createEffect(() => {
    const threads = sortedThreads()
    if (focusedIndex() >= threads.length && threads.length > 0) {
      setFocusedIndex(threads.length - 1)
    }
  })

  // Sync focused index when currentThreadId changes externally
  createEffect(() => {
    const threads = sortedThreads()
    if (props.currentThreadId === null) {
      // No thread selected - reset focus to -1 (nothing focused)
      setFocusedIndex(-1)
    } else {
      const idx = threads.findIndex(t => t.id === props.currentThreadId)
      if (idx !== -1) {
        setFocusedIndex(idx)
      }
    }
  })

  // Keyboard navigation for thread list (Ctrl+j/k to avoid conflict with text input)
  useKeyboard((key) => {
    const threads = sortedThreads()
    if (threads.length === 0) return

    // Ctrl+j or Ctrl+Down to move down
    if ((key.name === "j" && key.ctrl) || (key.name === "down" && key.ctrl)) {
      const newIndex = Math.min(focusedIndex() + 1, threads.length - 1)
      setFocusedIndex(newIndex)
      const thread = threads[newIndex]
      if (thread) props.onSelect(thread.id)
    }
    
    // Ctrl+k or Ctrl+Up to move up
    if ((key.name === "k" && key.ctrl) || (key.name === "up" && key.ctrl)) {
      const newIndex = Math.max(focusedIndex() - 1, 0)
      setFocusedIndex(newIndex)
      const thread = threads[newIndex]
      if (thread) props.onSelect(thread.id)
    }
  })

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Header with New button */}
      <box 
        paddingLeft={2} 
        paddingRight={2} 
        paddingTop={1} 
        paddingBottom={1}
        border={["bottom"]}
        borderColor="#333"
        flexDirection="row"
      >
        <text>
          <span style={{ fg: "#fff", bold: true }}>THREADS</span>
          <span style={{ fg: "#666" }}> ({props.threads.length})</span>
        </text>
        <box flexGrow={1} />
        <text fg="#666">[Ctrl+j/k]</text>
      </box>

      {/* Thread List */}
      <scrollbox
        flexGrow={1}
        paddingTop={1}
        scrollbarOptions={{ visible: true }}
        contentOptions={{
          flexDirection: "column",
          gap: 0,
        }}
      >
        <Show
          when={props.threads.length > 0}
          fallback={
            <box paddingLeft={2}>
              <text fg="#666">No threads yet. Start chatting!</text>
            </box>
          }
        >
          <For each={sortedThreads()}>
            {(thread, index) => {
              const isSelected = () => thread.id === props.currentThreadId
              const isFocused = () => index() === focusedIndex()
              return (
                <box
                  paddingLeft={2}
                  paddingRight={2}
                  paddingTop={0.5}
                  paddingBottom={0.5}
                  backgroundColor={isSelected() ? "#333" : isFocused() ? "#222" : undefined}
                >
                  <text>
                    <span style={{ fg: isFocused() ? "#ff6600" : isSelected() ? "#ff6600" : "#666" }}>
                      {isFocused() ? "▶" : isSelected() ? "●" : " "}
                    </span>
                    <span style={{ fg: isSelected() || isFocused() ? "#fff" : "#aaa" }}>
                      {" "}{thread.title}
                    </span>
                  </text>
                  <text fg="#555">
                    {"  "}{formatDate(thread.updatedAt)}
                  </text>
                </box>
              )
            }}
          </For>
        </Show>
      </scrollbox>
    </box>
  )
}

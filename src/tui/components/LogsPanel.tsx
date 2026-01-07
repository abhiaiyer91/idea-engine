import { For, Show } from "solid-js"
import { useLogStore, type LogLevel } from "../stores/logStore"

function getLevelColor(level: LogLevel): string {
  switch (level) {
    case "debug": return "#888"
    case "info": return "#00aaff"
    case "warn": return "#ffaa00"
    case "error": return "#ff4444"
  }
}

function getLevelIcon(level: LogLevel): string {
  switch (level) {
    case "debug": return "●"
    case "info": return "ℹ"
    case "warn": return "⚠"
    case "error": return "✗"
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { 
    hour: "2-digit", 
    minute: "2-digit", 
    second: "2-digit" 
  })
}

export function LogsPanel() {
  const { logs } = useLogStore()

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Logs Header */}
      <box paddingTop={1} paddingBottom={1} paddingLeft={2} border={["bottom"]} borderColor="#333">
        <text>
          <span style={{ fg: "#fff", bold: true }}>LOGS</span>
          <span style={{ fg: "#666" }}> ({logs.length})</span>
        </text>
      </box>

      {/* Logs List */}
      <scrollbox
        flexGrow={1}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        scrollbarOptions={{ visible: true }}
        stickyScroll
        stickyStart="bottom"
        contentOptions={{
          flexDirection: "column",
          gap: 0,
        }}
      >
        <Show
          when={logs.length > 0}
          fallback={
            <box>
              <text fg="#666">No logs yet...</text>
            </box>
          }
        >
          <For each={logs}>
            {(log) => (
              <box flexDirection="row">
                <text>
                  <span style={{ fg: "#555" }}>{formatTime(log.timestamp)}</span>
                  <span style={{ fg: getLevelColor(log.level) }}> {getLevelIcon(log.level)} </span>
                  <span style={{ fg: log.source ? "#888" : "#666" }}>
                    {log.source ? `[${log.source}] ` : ""}
                  </span>
                  <span style={{ fg: log.level === "error" ? "#ff6666" : "#ccc" }}>
                    {log.message.length > 100 ? log.message.slice(0, 100) + "..." : log.message}
                  </span>
                </text>
              </box>
            )}
          </For>
        </Show>
      </scrollbox>
    </box>
  )
}

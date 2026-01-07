import { For } from "solid-js"
import type { Agent, AgentStatus } from "../App.js"

function getStatusColor(status: AgentStatus): string {
  switch (status) {
    case "idle": return "#888"
    case "working": return "#00ff00"
    case "pr-open": return "#ff00ff"
    case "error": return "#ff0000"
  }
}

function getStatusIcon(status: AgentStatus): string {
  switch (status) {
    case "idle": return "○"
    case "working": return "●"
    case "pr-open": return "◉"
    case "error": return "✗"
  }
}

type AgentListProps = {
  agents: Agent[]
}

export function AgentList(props: AgentListProps) {
  return (
    <box 
      flexDirection="column" 
      paddingLeft={2} 
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      border={["bottom"]}
      borderColor="#333"
    >
      <text>
        <span style={{ fg: "#fff", bold: true }}>AGENTS</span>
      </text>
      
      <box paddingTop={1} flexDirection="column" gap={0.5}>
        <For each={props.agents}>
          {(agent) => (
            <box flexDirection="row">
              <text>
                <span style={{ fg: getStatusColor(agent.status) }}>
                  {getStatusIcon(agent.status)}
                </span>
                <span style={{ fg: "#fff" }}> {agent.name}</span>
                <span style={{ fg: "#666" }}> [{agent.status}]</span>
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}

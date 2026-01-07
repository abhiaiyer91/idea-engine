import { For, Show } from "solid-js"
import type { Issue } from "../App.js"

function getPriorityColor(priority: Issue["priority"]): string {
  switch (priority) {
    case "high": return "#ff0000"
    case "medium": return "#ffaa00"
    case "low": return "#00aaff"
  }
}

type IssueListProps = {
  issues: Issue[]
}

export function IssueList(props: IssueListProps) {
  return (
    <box 
      flexDirection="column" 
      paddingLeft={2} 
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      flexGrow={1}
    >
      <text>
        <span style={{ fg: "#fff", bold: true }}>GITHUB ISSUES</span>
        <span style={{ fg: "#666" }}> ({props.issues.length})</span>
      </text>
      
      <Show 
        when={props.issues.length > 0}
        fallback={
          <box paddingTop={1}>
            <text fg="#666">No issues yet. Chat with Product Visionary to create some!</text>
          </box>
        }
      >
        <scrollbox 
          paddingTop={1} 
          flexGrow={1}
          scrollbarOptions={{ visible: true }}
          contentOptions={{ gap: 0.5 }}
        >
          <For each={props.issues}>
            {(issue) => (
              <box flexDirection="row">
                <text>
                  <span style={{ fg: getPriorityColor(issue.priority) }}>●</span>
                  <span style={{ fg: "#666" }}> #{issue.number}</span>
                  <span style={{ fg: "#fff" }}> {issue.title}</span>
                </text>
              </box>
            )}
          </For>
        </scrollbox>
      </Show>
    </box>
  )
}

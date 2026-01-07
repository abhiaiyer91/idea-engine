type HeaderProps = {
  currentView: "chat" | "logs"
}

export function Header(props: HeaderProps) {
  return (
    <box 
      paddingLeft={2} 
      paddingRight={2} 
      paddingTop={1} 
      paddingBottom={1}
      border={["bottom"]}
      borderColor="#333"
    >
      <box flexDirection="row">
        <text>
          <span style={{ fg: "#ff6600", bold: true }}>FOUNDER MODE</span>
          <span style={{ fg: "#666" }}> | </span>
          <span style={{ fg: props.currentView === "chat" ? "#fff" : "#666" }}>Chat</span>
          <span style={{ fg: "#666" }}> / </span>
          <span style={{ fg: props.currentView === "logs" ? "#fff" : "#666" }}>Logs</span>
        </text>
        <box flexGrow={1} />
        <text fg="#666">[Tab] View  [Esc] New  [Ctrl+j/k] Threads  [Ctrl+C] Quit</text>
      </box>
    </box>
  )
}

import { For, Show, type Setter, type Accessor } from "solid-js"
import type { ChatMessage } from "../App.js"
import { ToolCallComponent } from "./ToolCallComponent.js"

type ChatPanelProps = {
  messages: Accessor<ChatMessage[]>
  inputValue: string
  onInputChange: Setter<string>
  onSubmit: (value: string) => void
}

export function ChatPanel(props: ChatPanelProps) {
  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={2}>
      {/* Chat Header */}
      <box paddingTop={1} paddingBottom={1} border={["bottom"]} borderColor="#333">
        <text>
          <span style={{ fg: "#00ff00" }}>●</span>
          <span style={{ fg: "#fff", bold: true }}> Product Visionary</span>
          <span style={{ fg: "#666" }}> - Describe your ideas</span>
        </text>
      </box>

      {/* Messages */}
      <scrollbox 
        flexGrow={1} 
        paddingTop={1}
        paddingBottom={1}
        scrollbarOptions={{ visible: true }}
        stickyScroll
        stickyStart="bottom"
        contentOptions={{ 
          gap: 1,
          flexDirection: "column",
        }}
      >
        <Show 
          when={props.messages().length > 0}
          fallback={
            <box>
              <text fg="#666">
                Start by describing an idea or feature you want to build...
              </text>
            </box>
          }
        >
          <For each={props.messages()}>
            {(message) => (
              <box flexDirection="column">
                {/* Message text */}
                <Show when={message.content.trim() !== ""}>
                  <box 
                    paddingLeft={1}
                    border={["left"]}
                    borderColor={message.role === "user" ? "#00ff00" : "#0088ff"}
                  >
                    <text>
                      <Show 
                        when={message.role === "user"}
                        fallback={<span style={{ fg: "#0088ff", bold: true }}>Visionary: </span>}
                      >
                        <span style={{ fg: "#00ff00", bold: true }}>You: </span>
                      </Show>
                      <span style={{ fg: "#fff" }}>{message.content}</span>
                      <Show when={message.role === "assistant" && message.content === ""}>
                        <span style={{ fg: "#ffff00" }}>▊</span>
                      </Show>
                    </text>
                  </box>
                </Show>
                
                {/* Tool calls - enhanced visual separation and handling */}
                <Show when={message.toolCalls && message.toolCalls.length > 0}>
                  <box flexDirection="column" paddingLeft={1} marginTop={1}>
                    {/* Header for multiple tool calls */}
                    <Show when={message.toolCalls!.length > 1}>
                      <box paddingBottom={1} marginBottom={1} border={["bottom"]} borderColor="#333">
                        <text style={{ fg: "#888", italic: true }}>
                          🔧 {message.toolCalls!.length} tool calls:
                        </text>
                      </box>
                    </Show>
                    
                    {/* Individual tool calls */}
                    <For each={message.toolCalls}>
                      {(toolCall, index) => (
                        <box>
                          <ToolCallComponent toolCall={toolCall} />
                          {/* Add spacing between multiple tool calls */}
                          <Show when={index() < message.toolCalls!.length - 1}>
                            <box height={1} />
                          </Show>
                        </box>
                      )}
                    </For>
                  </box>
                </Show>
                
                {/* Add spacing between messages */}
                <box height={1} />
              </box>
            )}
          </For>
        </Show>
      </scrollbox>

      {/* Input */}
      <box paddingTop={1} paddingBottom={1} border={["top"]} borderColor="#333">
        <box border borderColor="#444" paddingLeft={1} paddingRight={1}>
          <input
            focused
            value={props.inputValue}
            onChange={(e) => props.onInputChange(e)}
            onSubmit={(value) => props.onSubmit(value)}
            placeholder="Describe your idea..."
            backgroundColor="#111"
            textColor="#fff"
            placeholderColor="#666"
          />
        </box>
      </box>
    </box>
  )
}
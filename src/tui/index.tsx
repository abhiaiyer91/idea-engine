import { render } from "@opentui/solid"
import { App } from "./App"
import { interceptConsole } from "./stores/logStore"

// Intercept console.log/error/etc to show in TUI logs panel
interceptConsole()

render(App, {
  targetFps: 30,
})

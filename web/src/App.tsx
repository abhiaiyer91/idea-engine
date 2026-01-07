import { useEffect, useState, Component, type ReactNode } from 'react'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { ChatPanel } from './components/ChatPanel'
import { LogsPanel } from './components/LogsPanel'
import { SettingsModal } from './components/SettingsModal'
import { useAgentStore } from './stores/useAgentStore'

// Error boundary to catch component errors
class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Component error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

function App() {
  const loadThreads = useAgentStore(state => state.loadThreads)
  const [showSettings, setShowSettings] = useState(false)
  const [showLogs, setShowLogs] = useState(true)

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a]">
      <Header 
        onSettingsClick={() => setShowSettings(true)} 
        onLogsToggle={() => setShowLogs(!showLogs)}
        showLogs={showLogs}
      />
      <div className="flex-1 flex min-h-0">
        <ErrorBoundary fallback={<div className="w-80 bg-red-900 p-4 text-white">Sidebar Error</div>}>
          <Sidebar />
        </ErrorBoundary>
        <ChatPanel />
        {showLogs && <LogsPanel />}
      </div>
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />
    </div>
  )
}

export default App

import { useEffect, useState } from 'react'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { ChatPanel } from './components/ChatPanel'
import { LogsPanel } from './components/LogsPanel'
import { SettingsModal } from './components/SettingsModal'
import { useAgentStore } from './stores/useAgentStore'

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
        <Sidebar />
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

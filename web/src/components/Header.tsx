export interface HeaderProps {
  onSettingsClick: () => void
  onLogsToggle: () => void
  showLogs: boolean
}

export function Header({ onSettingsClick, onLogsToggle, showLogs }: HeaderProps) {
  return (
    <header className="px-4 py-3 border-b border-[#333] flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-orange-500 font-bold text-lg">FOUNDER MODE</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-gray-500 text-sm">AI-Powered Idea Factory</span>
        <button
          onClick={onLogsToggle}
          className={`text-sm px-2 py-1 rounded transition-colors ${
            showLogs 
              ? 'text-green-500 bg-green-500/10' 
              : 'text-gray-400 hover:text-white hover:bg-[#333]'
          }`}
          title="Toggle Logs Panel"
        >
          Logs
        </button>
        <button
          onClick={onSettingsClick}
          className="text-gray-400 hover:text-white px-2 py-1 hover:bg-[#333] rounded transition-colors"
          title="Settings"
        >
          Settings
        </button>
      </div>
    </header>
  )
}

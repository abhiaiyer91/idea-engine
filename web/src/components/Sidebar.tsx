import { useEffect, useState } from 'react'
import { useAgentStore } from '../stores/useAgentStore'
import type { Thread, GitHubIssue } from '../types'

function ThreadItem({ thread, isSelected, onClick, onDelete, showIssueNumber }: { 
  thread: Thread
  isSelected: boolean
  onClick: () => void
  onDelete: () => void
  showIssueNumber?: boolean
}) {
  const [showConfirm, setShowConfirm] = useState(false)
  
  const formatDate = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Yesterday'
    } else if (days < 7) {
      return `${days}d ago`
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowConfirm(true)
  }

  const confirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete()
    setShowConfirm(false)
  }

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowConfirm(false)
  }

  // For engineer threads, extract issue number and show it
  const issueNumber = thread.id.startsWith('engineer-') 
    ? thread.id.replace('engineer-', '') 
    : null

  return (
    <div
      onClick={onClick}
      className={`w-full text-left px-3 py-2 hover:bg-[#222] transition-colors cursor-pointer group ${
        isSelected ? 'bg-[#333] border-l-2 border-orange-500' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={isSelected ? 'text-orange-500' : 'text-gray-500'}>
          {isSelected ? '>' : ' '}
        </span>
        {showIssueNumber && issueNumber && (
          <span className="text-orange-500 text-sm font-mono">#{issueNumber}</span>
        )}
        <span className={`truncate flex-1 ${isSelected ? 'text-white' : 'text-gray-400'}`}>
          {showIssueNumber ? (thread.title || '').replace(`Engineer: Issue #${issueNumber}`, '').trim() || 'Working...' : (thread.title || 'Untitled')}
        </span>
        {showConfirm ? (
          <div className="flex items-center gap-1">
            <button
              onClick={confirmDelete}
              className="text-red-500 hover:text-red-400 text-xs px-1"
              title="Confirm delete"
            >
              Yes
            </button>
            <button
              onClick={cancelDelete}
              className="text-gray-400 hover:text-white text-xs px-1"
              title="Cancel"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity"
            title="Delete thread"
          >
            x
          </button>
        )}
      </div>
      <div className="text-gray-600 text-xs ml-5">
        {formatDate(thread.updatedAt)}
      </div>
    </div>
  )
}

function IssueItem({ issue, hasThread, isWorking, onStart, onViewThread }: { 
  issue: GitHubIssue
  hasThread: boolean
  isWorking: boolean
  onStart: () => void
  onViewThread: () => void
}) {
  return (
    <div className="px-3 py-2 border-b border-[#222] hover:bg-[#1a1a1a]">
      <div className="flex items-start gap-2">
        <span className="text-gray-500 text-sm font-mono">#{issue.number}</span>
        <div className="flex-1 min-w-0">
          <div className="text-gray-300 text-sm truncate">{issue.title}</div>
        </div>
        {isWorking ? (
          <span className="text-xs text-yellow-500 animate-pulse">Working...</span>
        ) : hasThread ? (
          <button
            onClick={onViewThread}
            className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1"
          >
            View
          </button>
        ) : (
          <button
            onClick={onStart}
            className="text-xs text-orange-500 hover:text-orange-400 px-2 py-1 border border-orange-500/50 rounded hover:bg-orange-500/10"
          >
            Start
          </button>
        )}
      </div>
    </div>
  )
}

export function Sidebar() {
  // Use individual selectors to prevent unnecessary re-renders
  const agents = useAgentStore(state => state.agents)
  const threads = useAgentStore(state => state.threads)
  const currentThreadId = useAgentStore(state => state.currentThreadId)
  const setCurrentThread = useAgentStore(state => state.setCurrentThread)
  const createNewThread = useAgentStore(state => state.createNewThread)
  const deleteThread = useAgentStore(state => state.deleteThread)
  const issues = useAgentStore(state => state.issues)
  const issuesLoading = useAgentStore(state => state.issuesLoading)
  const loadIssues = useAgentStore(state => state.loadIssues)
  const startEngineer = useAgentStore(state => state.startEngineer)

  // Load issues on mount
  useEffect(() => {
    loadIssues()
  }, [loadIssues])

  // Separate threads by type
  const visionaryThreads = threads.filter(t => t.id.startsWith('visionary-'))
  const engineerThreads = threads.filter(t => t.id.startsWith('engineer-'))
  
  // Track which issues have threads
  const issuesWithThreads = new Set(
    engineerThreads.map(t => parseInt(t.id.replace('engineer-', ''), 10))
  )
  
  // Track which engineers are working
  const workingEngineers = new Set(
    agents.filter(a => a.type === 'engineer' && a.status === 'working').map(a => a.issueNumber)
  )

  return (
    <div 
      className="border-r border-[#333] flex flex-col h-full bg-[#111]"
      style={{ width: '320px', minWidth: '320px', flexShrink: 0 }}
    >
      {/* VISIONARY Section */}
      <div className="border-b border-[#333]">
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-blue-500">@</span>
            <span className="text-white font-bold">VISIONARY</span>
            <span className="text-gray-500 text-sm">({visionaryThreads.length})</span>
          </div>
          <button
            onClick={createNewThread}
            className="text-gray-400 hover:text-white text-sm px-2 py-0.5 hover:bg-[#333] rounded transition-colors"
          >
            + New
          </button>
        </div>
        
        <div className="max-h-48 overflow-y-auto">
          {visionaryThreads.length === 0 ? (
            <div className="px-3 py-3 text-gray-500 text-sm">
              Start a conversation...
            </div>
          ) : (
            visionaryThreads.map(thread => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isSelected={thread.id === currentThreadId}
                onClick={() => setCurrentThread(thread.id)}
                onDelete={() => deleteThread(thread.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ENGINEERS Section */}
      <div className="border-b border-[#333] flex-1 flex flex-col min-h-0">
        <div className="px-3 py-2 flex items-center gap-2">
          <span className="text-orange-500">$</span>
          <span className="text-white font-bold">ENGINEERS</span>
          <span className="text-gray-500 text-sm">({engineerThreads.length})</span>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {engineerThreads.length === 0 ? (
            <div className="px-3 py-3 text-gray-500 text-sm">
              No engineers working yet. Start one from an issue below.
            </div>
          ) : (
            engineerThreads.map(thread => {
              const issueNum = parseInt(thread.id.replace('engineer-', ''), 10)
              const issue = issues.find(i => i.number === issueNum)
              const isWorking = workingEngineers.has(issueNum)
              
              return (
                <div
                  key={thread.id}
                  onClick={() => setCurrentThread(thread.id)}
                  className={`px-3 py-2 hover:bg-[#222] cursor-pointer group ${
                    thread.id === currentThreadId ? 'bg-[#333] border-l-2 border-orange-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={isWorking ? 'text-yellow-500 animate-pulse' : 'text-green-500'}>
                      {isWorking ? '>' : 'o'}
                    </span>
                    <span className="text-orange-500 font-mono text-sm">#{issueNum}</span>
                    <span className={`truncate flex-1 ${thread.id === currentThreadId ? 'text-white' : 'text-gray-400'} text-sm`}>
                      {issue?.title || 'Issue'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteThread(thread.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity"
                    >
                      x
                    </button>
                  </div>
                  {isWorking && (
                    <div className="text-yellow-500 text-xs ml-5 mt-0.5">Working...</div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ISSUES Section - Start new engineers */}
      <div className="flex-shrink-0" style={{ maxHeight: '35%' }}>
        <div className="px-3 py-2 flex items-center justify-between border-t border-[#333]">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">#</span>
            <span className="text-white font-bold">ISSUES</span>
            <span className="text-gray-500 text-sm">({issues.length})</span>
          </div>
          <button
            onClick={() => loadIssues()}
            className="text-xs text-gray-400 hover:text-white"
          >
            {issuesLoading ? '...' : 'Refresh'}
          </button>
        </div>
        
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 40px)' }}>
          {issues.length === 0 ? (
            <div className="px-3 py-3 text-gray-500 text-sm">
              {issuesLoading ? 'Loading...' : 'No open issues'}
            </div>
          ) : (
            issues.map(issue => (
              <IssueItem
                key={issue.number}
                issue={issue}
                hasThread={issuesWithThreads.has(issue.number)}
                isWorking={workingEngineers.has(issue.number)}
                onStart={() => startEngineer(issue.number)}
                onViewThread={() => setCurrentThread(`engineer-${issue.number}`)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

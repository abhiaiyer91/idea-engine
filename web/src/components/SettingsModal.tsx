import { useState, useEffect } from 'react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const API_KEY_STORAGE_KEY = 'founder-mode-api-keys'

export interface ApiKeys {
  anthropic?: string
  openai?: string
}

export function getStoredApiKeys(): ApiKeys {
  try {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

export function storeApiKeys(keys: ApiKeys) {
  localStorage.setItem(API_KEY_STORAGE_KEY, JSON.stringify(keys))
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const keys = getStoredApiKeys()
      setAnthropicKey(keys.anthropic || '')
      setOpenaiKey(keys.openai || '')
      setSaved(false)
    }
  }, [isOpen])

  const handleSave = () => {
    storeApiKeys({
      anthropic: anthropicKey || undefined,
      openai: openaiKey || undefined,
    })
    setSaved(true)
    setTimeout(() => {
      onClose()
    }, 500)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#111] border border-[#333] rounded-lg w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#333]">
          <h2 className="text-white font-bold">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">
              Anthropic API Key
            </label>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full bg-[#0a0a0a] border border-[#333] rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500"
            />
            <p className="text-gray-600 text-xs mt-1">
              Required for Claude models
            </p>
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1">
              OpenAI API Key
            </label>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-[#0a0a0a] border border-[#333] rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500"
            />
            <p className="text-gray-600 text-xs mt-1">
              Required for GPT models
            </p>
          </div>

          {saved && (
            <div className="text-green-500 text-sm">
              Settings saved!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#333]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

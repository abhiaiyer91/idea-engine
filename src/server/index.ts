import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { stream } from 'hono/streaming'
import { serve } from '@hono/node-server'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { productVisionaryAgent } from '../mastra/agents/product-visionary'
import { engineerAgent } from '../mastra/agents/engineer'

const execFileAsync = promisify(execFile)

// Storage persisted to .foundermode directory
const storage = new LibSQLStore({
  id: "founder-mode-storage",
  url: "file:.foundermode/mastra.db",
})

const mastra = new Mastra({
  agents: { 
    productVisionaryAgent,
    engineerAgent,
  },
  storage,
})

const app = new Hono()

// Enable CORS for development
app.use('/*', cors())

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }))

// ============ Threads API ============

// Get all threads for a resource
app.get('/api/threads', async (c) => {
  try {
    const memoryStore = await storage.getStore('memory')
    if (!memoryStore) {
      return c.json({ threads: [] })
    }
    
    const result = await memoryStore.listThreadsByResourceId({ 
      resourceId: 'founder-mode-user' 
    })
    
    return c.json({ threads: result.threads || [] })
  } catch (error) {
    console.error('Failed to load threads:', error)
    return c.json({ threads: [], error: 'Failed to load threads' }, 500)
  }
})

// Get messages for a thread
app.get('/api/threads/:threadId/messages', async (c) => {
  try {
    const threadId = c.req.param('threadId')
    const memoryStore = await storage.getStore('memory')
    
    if (!memoryStore) {
      return c.json({ messages: [] })
    }
    
    const result = await memoryStore.listMessages({ threadId })
    
    return c.json({ messages: result.messages })
  } catch (error) {
    console.error('Failed to load messages:', error)
    return c.json({ messages: [], error: 'Failed to load messages' }, 500)
  }
})

// Delete a thread
app.delete('/api/threads/:threadId', async (c) => {
  try {
    const threadId = c.req.param('threadId')
    const memoryStore = await storage.getStore('memory')
    
    if (!memoryStore) {
      return c.json({ error: 'Storage not available' }, 500)
    }
    
    await memoryStore.deleteThread({ threadId })
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Failed to delete thread:', error)
    return c.json({ error: 'Failed to delete thread' }, 500)
  }
})

// ============ Worktree API ============

// Delete a worktree for an issue
app.delete('/api/worktree/:issueNumber', async (c) => {
  try {
    const issueNumber = parseInt(c.req.param('issueNumber'), 10)
    
    if (isNaN(issueNumber)) {
      return c.json({ error: 'Invalid issue number' }, 400)
    }
    
    const worktreePath = `.worktrees/issue-${issueNumber}`
    
    // Check if worktree exists and remove it
    try {
      await execFileAsync('git', ['worktree', 'remove', worktreePath, '--force'])
      console.log(`[Worktree] Removed worktree for issue #${issueNumber}`)
      return c.json({ success: true, removed: true })
    } catch (error: any) {
      // Worktree might not exist, that's ok
      if (error.message?.includes('is not a working tree')) {
        return c.json({ success: true, removed: false })
      }
      throw error
    }
  } catch (error: any) {
    console.error('Failed to delete worktree:', error)
    return c.json({ error: error.message || 'Failed to delete worktree' }, 500)
  }
})

// ============ GitHub Issues API ============

// List GitHub issues
app.get('/api/issues', async (c) => {
  try {
    const state = c.req.query('state') || 'open'
    const { stdout } = await execFileAsync('gh', [
      'issue', 'list',
      '--state', state,
      '--limit', '50',
      '--json', 'number,title,state,labels,assignees,url,body,createdAt,updatedAt'
    ])
    
    const issues = JSON.parse(stdout || '[]').map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      labels: issue.labels?.map((l: any) => l.name) || [],
      assignees: issue.assignees?.map((a: any) => a.login) || [],
      url: issue.url,
      body: issue.body || '',
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    }))
    
    return c.json({ issues })
  } catch (error: any) {
    console.error('Failed to list issues:', error)
    return c.json({ issues: [], error: error.message }, 500)
  }
})

// Get single issue details
app.get('/api/issues/:number', async (c) => {
  try {
    const number = c.req.param('number')
    const { stdout } = await execFileAsync('gh', [
      'issue', 'view', number,
      '--json', 'number,title,state,labels,assignees,url,body,comments,createdAt,updatedAt'
    ])
    
    const issue = JSON.parse(stdout)
    return c.json({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      labels: issue.labels?.map((l: any) => l.name) || [],
      assignees: issue.assignees?.map((a: any) => a.login) || [],
      url: issue.url,
      body: issue.body || '',
      comments: issue.comments || [],
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    })
  } catch (error: any) {
    console.error('Failed to get issue:', error)
    return c.json({ error: error.message }, 500)
  }
})

// ============ Chat API ============

// Chat with the Product Visionary agent (streaming)
app.post('/api/chat', async (c) => {
  try {
    const body = await c.req.json()
    const { message, threadId, apiKeys } = body
    
    if (!message) {
      return c.json({ error: 'Message is required' }, 400)
    }

    // Set API keys from request if provided
    if (apiKeys?.anthropic) {
      process.env.ANTHROPIC_API_KEY = apiKeys.anthropic
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return c.json({ 
        error: 'Anthropic API key not configured. Please add it in Settings.' 
      }, 400)
    }
    
    const agent = mastra.getAgent('productVisionaryAgent')
    
    const response = await agent.stream(message, {
      threadId: threadId || `visionary-${crypto.randomUUID()}`,
      resourceId: 'founder-mode-user',
    })

    // Stream the response
    return stream(c, async (streamWriter) => {
      for await (const chunk of response.textStream) {
        await streamWriter.write(chunk)
      }
    })
    
  } catch (error: any) {
    console.error('Chat error:', error)
    return c.json({ error: error.message || 'Failed to process message' }, 500)
  }
})

// Chat with an Engineer agent on a specific issue (streaming with SSE)
// Thread ID format: engineer-{issueNumber}
app.post('/api/engineer/chat', async (c) => {
  try {
    const body = await c.req.json()
    const { message, issueNumber, apiKeys } = body
    
    if (!issueNumber) {
      return c.json({ error: 'Issue number is required' }, 400)
    }
    
    if (!message) {
      return c.json({ error: 'Message is required' }, 400)
    }

    // Set API keys
    if (apiKeys?.anthropic) {
      process.env.ANTHROPIC_API_KEY = apiKeys.anthropic
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return c.json({ error: 'Anthropic API key not configured' }, 400)
    }

    // Thread ID is deterministic based on issue number
    const threadId = `engineer-${issueNumber}`
    
    const agent = mastra.getAgent('engineerAgent')
    
    const response = await agent.stream(message, {
      threadId,
      resourceId: 'founder-mode-user',
      maxSteps: 100,
    })

    // Stream response with tool calls as SSE (same format as /engineer/start)
    return stream(c, async (streamWriter) => {
      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache')
      c.header('Connection', 'keep-alive')
      
      for await (const chunk of response.fullStream) {
        const payload = (chunk as any).payload || chunk
        
        if (chunk.type === 'text-delta') {
          const text = payload.textDelta || payload.text || ''
          if (text) {
            await streamWriter.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`)
          }
        } else if (chunk.type === 'tool-call') {
          await streamWriter.write(`data: ${JSON.stringify({ 
            type: 'tool-call', 
            toolCallId: payload.toolCallId || payload.id,
            toolName: payload.toolName || payload.name,
            args: payload.args || payload.arguments,
          })}\n\n`)
        } else if (chunk.type === 'tool-result') {
          const result = payload.result
          await streamWriter.write(`data: ${JSON.stringify({ 
            type: 'tool-result', 
            toolCallId: payload.toolCallId || payload.id,
            toolName: payload.toolName || payload.name,
            result: typeof result === 'string' 
              ? result.slice(0, 500)
              : result,
          })}\n\n`)
        } else if (chunk.type === 'step-finish') {
          await streamWriter.write(`data: ${JSON.stringify({ type: 'step-finish' })}\n\n`)
        } else if (chunk.type === 'finish') {
          await streamWriter.write(`data: ${JSON.stringify({ type: 'finish' })}\n\n`)
        }
      }
    })
    
  } catch (error: any) {
    console.error('Engineer chat error:', error)
    return c.json({ error: error.message || 'Failed to process message' }, 500)
  }
})

// Start an engineer on an issue - sends initial prompt and streams response with tool calls
app.post('/api/engineer/start', async (c) => {
  try {
    const body = await c.req.json()
    const { issueNumber, apiKeys } = body
    
    if (!issueNumber) {
      return c.json({ error: 'Issue number is required' }, 400)
    }

    // Set API keys
    if (apiKeys?.anthropic) {
      process.env.ANTHROPIC_API_KEY = apiKeys.anthropic
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return c.json({ error: 'Anthropic API key not configured' }, 400)
    }

    // Get issue details
    const { stdout } = await execFileAsync('gh', [
      'issue', 'view', String(issueNumber),
      '--json', 'number,title,body,labels'
    ])
    const issue = JSON.parse(stdout)

    // Thread ID is deterministic based on issue number
    const threadId = `engineer-${issueNumber}`
    
    // Build the initial prompt - be explicit about issueNumber
    const prompt = `You are assigned to work on GitHub Issue #${issue.number}: "${issue.title}"

## Issue Description:
${issue.body || 'No description provided.'}

## Labels: ${issue.labels?.map((l: any) => l.name).join(', ') || 'none'}

## YOUR TASK
Implement this issue completely. The issue number is ${issue.number} - use this as the issueNumber parameter for ALL tool calls.

You MUST:
1. Call setupWorktree with issueNumber=${issue.number}
2. Write the necessary code using writeFileContent with issueNumber=${issue.number}
3. Commit with gitCommit with issueNumber=${issue.number}
4. Push with gitPush with issueNumber=${issue.number}
5. Create a PR with createPullRequest with issueNumber=${issue.number}

Do NOT stop until you have a PR URL. Begin now.`

    const agent = mastra.getAgent('engineerAgent')
    
    const response = await agent.stream(prompt, {
      threadId,
      resourceId: 'founder-mode-user',
      maxSteps: 100,
    })

    // Stream response with tool calls as SSE
    return stream(c, async (streamWriter) => {
      // Set headers for SSE
      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache')
      c.header('Connection', 'keep-alive')
      
      let textBuffer = ''
      
      // Process the full stream which includes tool calls
      for await (const chunk of response.fullStream) {
        const payload = (chunk as any).payload || chunk
        
        // Debug: log all chunk types
        console.log('[Stream] Chunk type:', chunk.type, 'payload keys:', Object.keys(payload))
        
        if (chunk.type === 'text-delta') {
          // Text chunk - try multiple possible locations for text
          const text = payload.textDelta || payload.text || (chunk as any).textDelta || (chunk as any).text || ''
          if (text) {
            textBuffer += text
            console.log('[Stream] Sending text chunk:', text.length, 'chars')
            await streamWriter.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`)
          } else {
            console.log('[Stream] text-delta but no text found, payload:', JSON.stringify(payload).slice(0, 200))
          }
        } else if (chunk.type === 'tool-call') {
          // Tool call started
          console.log('[Stream] Tool call:', payload.toolName || payload.name)
          await streamWriter.write(`data: ${JSON.stringify({ 
            type: 'tool-call', 
            toolCallId: payload.toolCallId || payload.id,
            toolName: payload.toolName || payload.name,
            args: payload.args || payload.arguments,
          })}\n\n`)
        } else if (chunk.type === 'tool-result') {
          // Tool call completed
          const result = payload.result
          await streamWriter.write(`data: ${JSON.stringify({ 
            type: 'tool-result', 
            toolCallId: payload.toolCallId || payload.id,
            toolName: payload.toolName || payload.name,
            result: typeof result === 'string' 
              ? result.slice(0, 500) // Truncate long results
              : result,
          })}\n\n`)
        } else if (chunk.type === 'step-finish') {
          // Step finished - agent completed a step (may have more steps)
          console.log('[Stream] Step finished, text so far:', textBuffer.length, 'chars')
          await streamWriter.write(`data: ${JSON.stringify({ type: 'step-finish' })}\n\n`)
        } else if (chunk.type === 'finish') {
          // Stream finished
          console.log('[Stream] Finished, total text:', textBuffer.length, 'chars')
          await streamWriter.write(`data: ${JSON.stringify({ type: 'finish' })}\n\n`)
        }
      }
    })
    
  } catch (error: any) {
    console.error('Engineer start error:', error)
    return c.json({ error: error.message || 'Failed to start engineer' }, 500)
  }
})

const port = 4111
console.log(`Server running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port,
})

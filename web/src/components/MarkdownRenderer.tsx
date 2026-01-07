import { useEffect, useMemo } from 'react'
import { marked } from 'marked'
import hljs from 'highlight.js'

// Import highlight.js CSS for syntax highlighting
import 'highlight.js/styles/github-dark.css'

interface MarkdownRendererProps {
  content: string
  className?: string
}

// Configure marked with GitHub Flavored Markdown and syntax highlighting
const configureMarked = () => {
  marked.setOptions({
    gfm: true,
    breaks: true,
    highlight: (code: string, lang: string) => {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value
        } catch (err) {
          console.warn('Highlight.js error:', err)
        }
      }
      return hljs.highlightAuto(code).value
    }
  })

  // Custom renderer for better styling
  const renderer = new marked.Renderer()

  // Override code block rendering to add copy functionality
  renderer.code = (code: string, language?: string) => {
    const lang = language || 'text'
    const escapedCode = code.replace(/"/g, '&quot;')
    
    return `
      <div class="code-block-container">
        <div class="code-block-header">
          <span class="code-block-language">${lang}</span>
          <button 
            class="code-block-copy" 
            onclick="navigator.clipboard.writeText('${escapedCode}').then(() => {
              this.textContent = 'Copied!';
              setTimeout(() => this.textContent = 'Copy', 2000);
            })"
            title="Copy code"
          >
            Copy
          </button>
        </div>
        <pre class="code-block-content"><code class="hljs language-${lang}">${hljs.highlight(code, { language: lang }).value}</code></pre>
      </div>
    `
  }

  // Override inline code rendering
  renderer.codespan = (code: string) => {
    return `<code class="inline-code">${code}</code>`
  }

  // Override table rendering for better styling
  renderer.table = (header: string, body: string) => {
    return `
      <div class="table-container">
        <table class="markdown-table">
          <thead>${header}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `
  }

  // Override link rendering to handle external links
  renderer.link = (href: string, title: string | null, text: string) => {
    const titleAttr = title ? ` title="${title}"` : ''
    const isExternal = href.startsWith('http')
    const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''
    
    return `<a href="${href}"${titleAttr}${target} class="markdown-link">${text}</a>`
  }

  // Override blockquote rendering
  renderer.blockquote = (quote: string) => {
    return `<blockquote class="markdown-blockquote">${quote}</blockquote>`
  }

  marked.use({ renderer })
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  // Configure marked on component mount
  useEffect(() => {
    configureMarked()
  }, [])

  // Parse markdown content
  const htmlContent = useMemo(() => {
    try {
      return marked.parse(content)
    } catch (error) {
      console.error('Markdown parsing error:', error)
      return `<p class="text-red-400">Error rendering markdown: ${error}</p>`
    }
  }, [content])

  return (
    <div 
      className={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  )
}
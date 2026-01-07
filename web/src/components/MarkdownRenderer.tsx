import { useEffect, useMemo } from 'react'
import { marked, type Tokens } from 'marked'
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
  })

  // Custom renderer for better styling
  const renderer = new marked.Renderer()

  // Override code block rendering to add copy functionality
  renderer.code = ({ text, lang }: Tokens.Code) => {
    const language = lang || 'text'
    let highlighted: string
    
    try {
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(text, { language: lang }).value
      } else {
        highlighted = hljs.highlightAuto(text).value
      }
    } catch {
      highlighted = text
    }
    
    const escapedCode = text.replace(/"/g, '&quot;').replace(/'/g, "\\'").replace(/\n/g, '\\n')
    
    return `
      <div class="code-block-container">
        <div class="code-block-header">
          <span class="code-block-language">${language}</span>
          <button 
            class="code-block-copy" 
            onclick="navigator.clipboard.writeText('${escapedCode}'.replace(/\\\\n/g, '\\n')).then(() => {
              this.textContent = 'Copied!';
              setTimeout(() => this.textContent = 'Copy', 2000);
            })"
            title="Copy code"
          >
            Copy
          </button>
        </div>
        <pre class="code-block-content"><code class="hljs language-${language}">${highlighted}</code></pre>
      </div>
    `
  }

  // Override inline code rendering
  renderer.codespan = ({ text }: Tokens.Codespan) => {
    return `<code class="inline-code">${text}</code>`
  }

  // Override link rendering to handle external links
  renderer.link = ({ href, title, text }: Tokens.Link) => {
    const titleAttr = title ? ` title="${title}"` : ''
    const isExternal = href.startsWith('http')
    const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''
    
    return `<a href="${href}"${titleAttr}${target} class="markdown-link">${text}</a>`
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

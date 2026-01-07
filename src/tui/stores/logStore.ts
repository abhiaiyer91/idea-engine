import { createStore, produce } from "solid-js/store"
import { Transform } from "node:stream"
import { hostname } from "node:os"
import type { BaseLogMessage, LoggerTransport } from "@mastra/core/logger"
import type { IMastraLogger } from "@mastra/core/logger"
import type { LogLevel as MastraLogLevel } from "@mastra/core/logger"

export type LogLevel = "debug" | "info" | "warn" | "error"

export type LogEntry = {
  id: string
  level: LogLevel
  message: string
  timestamp: Date
  source?: string
  runId?: string
}

const [logs, setLogs] = createStore<LogEntry[]>([])

// Max logs to keep in memory
const MAX_LOGS = 500

// Store original console methods
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
}

function addLog(level: LogLevel, message: string, source?: string, runId?: string) {
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    level,
    message,
    timestamp: new Date(),
    source,
    runId,
  }

  setLogs(
    produce((logs) => {
      logs.push(entry)
      // Trim old logs if we exceed max
      if (logs.length > MAX_LOGS) {
        logs.splice(0, logs.length - MAX_LOGS)
      }
    })
  )
}

function formatArgs(args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`
      try {
        return JSON.stringify(arg, null, 2)
      } catch {
        return String(arg)
      }
    })
    .join(" ")
}

// Intercept console methods
export function interceptConsole() {
  console.log = (...args: any[]) => {
    addLog("info", formatArgs(args))
  }

  console.info = (...args: any[]) => {
    addLog("info", formatArgs(args))
  }

  console.warn = (...args: any[]) => {
    addLog("warn", formatArgs(args))
  }

  console.error = (...args: any[]) => {
    addLog("error", formatArgs(args))
  }

  console.debug = (...args: any[]) => {
    addLog("debug", formatArgs(args))
  }
}

// Restore original console (useful for debugging the TUI itself)
export function restoreConsole() {
  console.log = originalConsole.log
  console.info = originalConsole.info
  console.warn = originalConsole.warn
  console.error = originalConsole.error
  console.debug = originalConsole.debug
}

// TUI Transport for Mastra logger
class TuiLoggerTransport extends Transform {
  constructor() {
    super({ objectMode: true })
  }

  _transform(chunk: any, _encoding: string, callback: () => void) {
    try {
      const logData = typeof chunk === "string" ? JSON.parse(chunk) : chunk
      const level = (logData.level || "info") as LogLevel
      const message = logData.msg || logData.message || String(chunk)
      addLog(level, message, logData.name, logData.runId)
    } catch {
      addLog("info", String(chunk))
    }
    callback()
  }

  async listLogs(args?: {
    fromDate?: Date
    toDate?: Date
    logLevel?: MastraLogLevel
    filters?: Record<string, any>
    page?: number
    perPage?: number
  }): Promise<{
    logs: BaseLogMessage[]
    total: number
    page: number
    perPage: number
    hasMore: boolean
  }> {
    const page = args?.page || 1
    const perPage = args?.perPage || 50
    
    let filteredLogs = [...logs]
    
    if (args?.fromDate) {
      filteredLogs = filteredLogs.filter(l => l.timestamp >= args.fromDate!)
    }
    if (args?.toDate) {
      filteredLogs = filteredLogs.filter(l => l.timestamp <= args.toDate!)
    }
    if (args?.logLevel) {
      filteredLogs = filteredLogs.filter(l => l.level === args.logLevel)
    }

    const start = (page - 1) * perPage
    const paginatedLogs = filteredLogs.slice(start, start + perPage)

    return {
      logs: paginatedLogs.map(l => ({
        msg: l.message,
        level: l.level as MastraLogLevel,
        time: l.timestamp,
        pid: process.pid,
        hostname: hostname(),
        name: l.source || "tui",
        runId: l.runId,
      })),
      total: filteredLogs.length,
      page,
      perPage,
      hasMore: start + perPage < filteredLogs.length,
    }
  }

  async listLogsByRunId(args: {
    runId: string
    fromDate?: Date
    toDate?: Date
    logLevel?: MastraLogLevel
    filters?: Record<string, any>
    page?: number
    perPage?: number
  }): Promise<{
    logs: BaseLogMessage[]
    total: number
    page: number
    perPage: number
    hasMore: boolean
  }> {
    const runLogs = logs.filter(l => l.runId === args.runId)
    return this.listLogs({ ...args, page: args.page, perPage: args.perPage })
  }
}

// Create singleton transport
const tuiTransport = new TuiLoggerTransport()

// IMastraLogger-compatible TUI Logger
export class TuiLogger implements IMastraLogger {
  private name: string
  private transports: Map<string, LoggerTransport>

  constructor(name: string = "TuiLogger") {
    this.name = name
    this.transports = new Map()
    this.transports.set("tui", tuiTransport as unknown as LoggerTransport)
  }

  debug(message: string, ...args: any[]): void {
    const fullMessage = args.length > 0 ? `${message} ${formatArgs(args)}` : message
    addLog("debug", fullMessage, this.name)
  }

  info(message: string, ...args: any[]): void {
    const fullMessage = args.length > 0 ? `${message} ${formatArgs(args)}` : message
    addLog("info", fullMessage, this.name)
  }

  warn(message: string, ...args: any[]): void {
    const fullMessage = args.length > 0 ? `${message} ${formatArgs(args)}` : message
    addLog("warn", fullMessage, this.name)
  }

  error(message: string, ...args: any[]): void {
    const fullMessage = args.length > 0 ? `${message} ${formatArgs(args)}` : message
    addLog("error", fullMessage, this.name)
  }

  trackException(error: Error & { code?: string }): void {
    addLog("error", `Exception: ${error.message}`, this.name)
  }

  getTransports(): Map<string, LoggerTransport> {
    return this.transports
  }

  async listLogs(transportId: string, params?: {
    fromDate?: Date
    toDate?: Date
    logLevel?: MastraLogLevel
    filters?: Record<string, any>
    page?: number
    perPage?: number
  }): Promise<{
    logs: BaseLogMessage[]
    total: number
    page: number
    perPage: number
    hasMore: boolean
  }> {
    const transport = this.transports.get(transportId)
    if (transport) {
      return (transport as unknown as TuiLoggerTransport).listLogs(params)
    }
    return { logs: [], total: 0, page: 1, perPage: 50, hasMore: false }
  }

  async listLogsByRunId(args: {
    transportId: string
    runId: string
    fromDate?: Date
    toDate?: Date
    logLevel?: MastraLogLevel
    filters?: Record<string, any>
    page?: number
    perPage?: number
  }): Promise<{
    logs: BaseLogMessage[]
    total: number
    page: number
    perPage: number
    hasMore: boolean
  }> {
    const transport = this.transports.get(args.transportId)
    if (transport) {
      return (transport as unknown as TuiLoggerTransport).listLogsByRunId(args)
    }
    return { logs: [], total: 0, page: 1, perPage: 50, hasMore: false }
  }
}

// Export singleton logger instance
export const tuiLogger = new TuiLogger()

// Simple logger API for direct use in TUI code
export const logger = {
  debug: (message: string, source?: string) => addLog("debug", message, source),
  info: (message: string, source?: string) => addLog("info", message, source),
  warn: (message: string, source?: string) => addLog("warn", message, source),
  error: (message: string, source?: string) => addLog("error", message, source),
}

export function useLogStore() {
  const clearLogs = () => {
    setLogs([])
  }

  return {
    logs,
    clearLogs,
    logger,
  }
}

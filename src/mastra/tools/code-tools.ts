import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { readFile, writeFile, readdir, stat, mkdir, rm } from "fs/promises";
import { join, dirname, relative } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

// Get the project root (where the tool is being executed from)
function getProjectRoot(): string {
  return process.cwd();
}

// Worktrees are stored in .worktrees/issue-{N}/
function getWorktreePath(issueNumber: number): string {
  return join(getProjectRoot(), ".worktrees", `issue-${issueNumber}`);
}

// Get the working directory - either worktree (if issue context) or project root
function getWorkingDir(issueNumber?: number): string {
  if (issueNumber) {
    const worktreePath = getWorktreePath(issueNumber);
    if (existsSync(worktreePath)) {
      return worktreePath;
    }
  }
  return getProjectRoot();
}

// Helper to ensure path is within allowed directory
function resolveSafePath(filePath: string, baseDir: string): string {
  const resolved = join(baseDir, filePath);
  
  // Security: ensure we stay within base directory
  if (!resolved.startsWith(baseDir)) {
    throw new Error("Path escapes allowed directory");
  }
  
  return resolved;
}

// ============================================
// WORKTREE MANAGEMENT
// ============================================

export const setupWorktree = createTool({
  id: "setup-worktree",
  description: "Create a git worktree for working on an issue. MUST be called before making any changes for an issue.",
  inputSchema: z.object({
    issueNumber: z.number().describe("Issue number to create worktree for"),
    branchName: z.string().describe("Branch name (e.g., 'feature/issue-5-add-auth')"),
    baseBranch: z.string().default("main").describe("Base branch to create from"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    worktreePath: z.string(),
    branch: z.string(),
    created: z.boolean().describe("True if newly created, false if already existed"),
  }),
  execute: async (input) => {
    const root = getProjectRoot();
    const worktreePath = getWorktreePath(input.issueNumber);
    const worktreesDir = join(root, ".worktrees");
    
    // Check if worktree already exists
    if (existsSync(worktreePath)) {
      // Verify it's a valid worktree
      try {
        const { stdout } = await execFileAsync("git", ["branch", "--show-current"], { cwd: worktreePath });
        return {
          success: true,
          worktreePath: relative(root, worktreePath),
          branch: stdout.trim(),
          created: false,
        };
      } catch {
        // Invalid worktree, remove and recreate
        await rm(worktreePath, { recursive: true, force: true });
      }
    }
    
    // Ensure .worktrees directory exists
    await mkdir(worktreesDir, { recursive: true });
    
    // Fetch latest from origin
    try {
      await execFileAsync("git", ["fetch", "origin", input.baseBranch], { cwd: root });
    } catch {
      // May fail if offline
    }
    
    // Check if branch already exists
    let branchExists = false;
    try {
      await execFileAsync("git", ["rev-parse", "--verify", input.branchName], { cwd: root });
      branchExists = true;
    } catch {
      // Branch doesn't exist
    }
    
    if (branchExists) {
      // Create worktree with existing branch
      await execFileAsync("git", ["worktree", "add", worktreePath, input.branchName], { cwd: root });
    } else {
      // Create worktree with new branch from base
      await execFileAsync("git", [
        "worktree", "add", 
        "-b", input.branchName,
        worktreePath,
        `origin/${input.baseBranch}`
      ], { cwd: root });
    }
    
    return {
      success: true,
      worktreePath: relative(root, worktreePath),
      branch: input.branchName,
      created: true,
    };
  },
});

export const cleanupWorktree = createTool({
  id: "cleanup-worktree",
  description: "Remove a worktree after work is complete (PR merged, etc.)",
  inputSchema: z.object({
    issueNumber: z.number().describe("Issue number whose worktree to remove"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    removed: z.boolean(),
  }),
  execute: async (input) => {
    const root = getProjectRoot();
    const worktreePath = getWorktreePath(input.issueNumber);
    
    if (!existsSync(worktreePath)) {
      return { success: true, removed: false };
    }
    
    // Remove the worktree
    await execFileAsync("git", ["worktree", "remove", worktreePath, "--force"], { cwd: root });
    
    return { success: true, removed: true };
  },
});

// ============================================
// FILE TOOLS (work within worktree)
// ============================================

// Max characters to return from file reads to prevent context explosion
const MAX_FILE_CONTENT_LENGTH = 10000;

export const readFileContent = createTool({
  id: "read-file",
  description: "Read the contents of a file. If issueNumber provided, reads from that issue's worktree.",
  inputSchema: z.object({
    path: z.string().describe("Relative path to the file"),
    issueNumber: z.number().optional().describe("Issue number (to read from worktree)"),
    startLine: z.number().optional().describe("Start reading from this line (1-indexed)"),
    endLine: z.number().optional().describe("Stop reading at this line (inclusive)"),
  }),
  outputSchema: z.object({
    content: z.string(),
    lineCount: z.number(),
    truncated: z.boolean(),
  }),
  execute: async (input) => {
    const baseDir = getWorkingDir(input.issueNumber);
    const fullPath = resolveSafePath(input.path, baseDir);
    let content = await readFile(fullPath, "utf-8");
    const totalLineCount = content.split("\n").length;
    
    // If line range specified, extract just those lines
    if (input.startLine || input.endLine) {
      const lines = content.split("\n");
      const start = (input.startLine || 1) - 1;
      const end = input.endLine || lines.length;
      content = lines.slice(start, end).join("\n");
    }
    
    // Truncate if too long
    let truncated = false;
    if (content.length > MAX_FILE_CONTENT_LENGTH) {
      content = content.slice(0, MAX_FILE_CONTENT_LENGTH) + "\n...[truncated]";
      truncated = true;
    }
    
    return { content, lineCount: totalLineCount, truncated };
  },
});

export const writeFileContent = createTool({
  id: "write-file",
  description: "Write content to a file in a worktree (creates directories if needed). REQUIRES issueNumber.",
  inputSchema: z.object({
    path: z.string().describe("Relative path to the file"),
    content: z.string().describe("Content to write to the file"),
    issueNumber: z.number().describe("Issue number (writes to that issue's worktree)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    bytesWritten: z.number(),
  }),
  execute: async (input) => {
    const baseDir = getWorkingDir(input.issueNumber);
    
    // Verify worktree exists
    if (baseDir === getProjectRoot()) {
      throw new Error(`No worktree found for issue #${input.issueNumber}. Call setup-worktree first.`);
    }
    
    const fullPath = resolveSafePath(input.path, baseDir);
    
    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });
    
    await writeFile(fullPath, input.content, "utf-8");
    
    return {
      success: true,
      path: input.path,
      bytesWritten: Buffer.byteLength(input.content, "utf-8"),
    };
  },
});

export const listDirectory = createTool({
  id: "list-directory",
  description: "List files and directories in a path",
  inputSchema: z.object({
    path: z.string().default(".").describe("Relative path to list (defaults to root)"),
    issueNumber: z.number().optional().describe("Issue number (to list from worktree)"),
    recursive: z.boolean().default(false).describe("Whether to list recursively"),
    maxDepth: z.number().default(3).describe("Maximum depth for recursive listing"),
  }),
  outputSchema: z.object({
    entries: z.array(z.object({
      name: z.string(),
      path: z.string(),
      type: z.enum(["file", "directory"]),
      size: z.number().optional(),
    })),
  }),
  execute: async (input) => {
    const baseDir = getWorkingDir(input.issueNumber);
    const fullPath = resolveSafePath(input.path, baseDir);
    
    async function listDir(dir: string, depth: number): Promise<any[]> {
      if (depth > input.maxDepth) return [];
      
      const entries = await readdir(dir, { withFileTypes: true });
      const results: any[] = [];
      
      for (const entry of entries) {
        // Skip node_modules, .git, .worktrees, etc.
        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }
        
        const entryPath = join(dir, entry.name);
        const relativePath = relative(baseDir, entryPath);
        
        if (entry.isDirectory()) {
          results.push({
            name: entry.name,
            path: relativePath,
            type: "directory" as const,
          });
          
          if (input.recursive) {
            const subEntries = await listDir(entryPath, depth + 1);
            results.push(...subEntries);
          }
        } else if (entry.isFile()) {
          const stats = await stat(entryPath);
          results.push({
            name: entry.name,
            path: relativePath,
            type: "file" as const,
            size: stats.size,
          });
        }
      }
      
      return results;
    }
    
    const entries = await listDir(fullPath, 0);
    return { entries };
  },
});

// Max search results to return
const MAX_SEARCH_RESULTS = 50;

export const searchFiles = createTool({
  id: "search-files",
  description: "Search for text patterns in files using grep. Returns max 50 matches.",
  inputSchema: z.object({
    pattern: z.string().describe("Search pattern (regex supported)"),
    path: z.string().default(".").describe("Directory to search in"),
    issueNumber: z.number().optional().describe("Issue number (to search in worktree)"),
    filePattern: z.string().optional().describe("Glob pattern to filter files (e.g., '*.ts')"),
  }),
  outputSchema: z.object({
    matches: z.array(z.object({
      file: z.string(),
      line: z.number(),
      content: z.string(),
    })),
    totalMatches: z.number(),
    truncated: z.boolean(),
  }),
  execute: async (input) => {
    const baseDir = getWorkingDir(input.issueNumber);
    const fullPath = resolveSafePath(input.path, baseDir);
    
    try {
      const args = [
        "-r",                    // recursive
        "-n",                    // line numbers
        "--include", input.filePattern || "*",
        input.pattern,
        fullPath,
      ];
      
      const { stdout } = await execFileAsync("grep", args, { maxBuffer: 10 * 1024 * 1024 });
      
      const allMatches = stdout.trim().split("\n").filter(Boolean).map((line) => {
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          return {
            file: relative(baseDir, match[1]),
            line: parseInt(match[2], 10),
            content: match[3].trim().slice(0, 200), // Truncate long lines
          };
        }
        return null;
      }).filter(Boolean);
      
      const totalMatches = allMatches.length;
      const truncated = totalMatches > MAX_SEARCH_RESULTS;
      const matches = allMatches.slice(0, MAX_SEARCH_RESULTS);
      
      return {
        matches: matches as any[],
        totalMatches,
        truncated,
      };
    } catch (error: any) {
      // grep returns exit code 1 if no matches found
      if (error.code === 1) {
        return { matches: [], totalMatches: 0, truncated: false };
      }
      throw error;
    }
  },
});

// ============================================
// GIT TOOLS (work within worktree)
// ============================================

async function runGitCommand(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

export const gitStatus = createTool({
  id: "git-status",
  description: "Get the current git status. If issueNumber provided, shows status for that worktree.",
  inputSchema: z.object({
    issueNumber: z.number().optional().describe("Issue number (to check worktree status)"),
  }),
  outputSchema: z.object({
    branch: z.string(),
    worktree: z.string().optional(),
    modified: z.array(z.string()),
    staged: z.array(z.string()),
    untracked: z.array(z.string()),
    ahead: z.number(),
    behind: z.number(),
  }),
  execute: async (input) => {
    const cwd = getWorkingDir(input.issueNumber);
    const isWorktree = cwd !== getProjectRoot();
    
    const branch = await runGitCommand(["branch", "--show-current"], cwd);
    
    // Get porcelain status for parsing
    const status = await runGitCommand(["status", "--porcelain"], cwd);
    
    const modified: string[] = [];
    const staged: string[] = [];
    const untracked: string[] = [];
    
    for (const line of status.split("\n").filter(Boolean)) {
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const file = line.slice(3);
      
      if (indexStatus === "?" && workTreeStatus === "?") {
        untracked.push(file);
      } else if (indexStatus !== " " && indexStatus !== "?") {
        staged.push(file);
      } else if (workTreeStatus !== " ") {
        modified.push(file);
      }
    }
    
    // Get ahead/behind counts
    let ahead = 0;
    let behind = 0;
    try {
      const revList = await runGitCommand(["rev-list", "--left-right", "--count", `origin/${branch}...HEAD`], cwd);
      const [behindStr, aheadStr] = revList.split("\t");
      behind = parseInt(behindStr, 10) || 0;
      ahead = parseInt(aheadStr, 10) || 0;
    } catch {
      // No upstream set or no remote
    }
    
    return { 
      branch, 
      worktree: isWorktree ? relative(getProjectRoot(), cwd) : undefined,
      modified, 
      staged, 
      untracked, 
      ahead, 
      behind 
    };
  },
});

export const gitCommit = createTool({
  id: "git-commit",
  description: "Stage and commit changes in a worktree. REQUIRES issueNumber.",
  inputSchema: z.object({
    message: z.string().describe("Commit message"),
    issueNumber: z.number().describe("Issue number (commits in that worktree)"),
    files: z.array(z.string()).optional().describe("Specific files to stage (if not provided, stages all)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    hash: z.string(),
    filesChanged: z.number(),
  }),
  execute: async (input) => {
    const cwd = getWorkingDir(input.issueNumber);
    
    if (cwd === getProjectRoot()) {
      throw new Error(`No worktree found for issue #${input.issueNumber}. Call setup-worktree first.`);
    }
    
    // Stage files
    if (input.files && input.files.length > 0) {
      await runGitCommand(["add", ...input.files], cwd);
    } else {
      await runGitCommand(["add", "-A"], cwd);
    }
    
    // Commit
    await runGitCommand(["commit", "-m", input.message], cwd);
    
    // Get commit hash
    const hash = await runGitCommand(["rev-parse", "--short", "HEAD"], cwd);
    
    // Get files changed count
    let filesChanged = 0;
    try {
      const diffStat = await runGitCommand(["diff", "--shortstat", "HEAD~1", "HEAD"], cwd);
      const filesMatch = diffStat.match(/(\d+) files? changed/);
      filesChanged = filesMatch ? parseInt(filesMatch[1], 10) : 0;
    } catch {
      // First commit in branch
    }
    
    return { success: true, hash, filesChanged };
  },
});

export const gitPush = createTool({
  id: "git-push",
  description: "Push current branch to remote. REQUIRES issueNumber.",
  inputSchema: z.object({
    issueNumber: z.number().describe("Issue number (pushes from that worktree)"),
    setUpstream: z.boolean().default(true).describe("Set upstream tracking"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    branch: z.string(),
  }),
  execute: async (input) => {
    const cwd = getWorkingDir(input.issueNumber);
    
    if (cwd === getProjectRoot()) {
      throw new Error(`No worktree found for issue #${input.issueNumber}. Call setup-worktree first.`);
    }
    
    const branch = await runGitCommand(["branch", "--show-current"], cwd);
    
    const args = ["push"];
    if (input.setUpstream) {
      args.push("-u", "origin", branch);
    }
    
    await runGitCommand(args, cwd);
    
    return { success: true, branch };
  },
});

export const gitDiff = createTool({
  id: "git-diff",
  description: "Get diff of changes (staged or unstaged)",
  inputSchema: z.object({
    issueNumber: z.number().optional().describe("Issue number (to diff in worktree)"),
    staged: z.boolean().default(false).describe("Show staged changes"),
    file: z.string().optional().describe("Specific file to diff"),
  }),
  outputSchema: z.object({
    diff: z.string(),
    linesAdded: z.number(),
    linesRemoved: z.number(),
  }),
  execute: async (input) => {
    const cwd = getWorkingDir(input.issueNumber);
    
    const args = ["diff"];
    if (input.staged) {
      args.push("--cached");
    }
    if (input.file) {
      args.push("--", input.file);
    }
    
    const diff = await runGitCommand(args, cwd);
    
    // Count added/removed lines
    const lines = diff.split("\n");
    const linesAdded = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
    const linesRemoved = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
    
    return { diff, linesAdded, linesRemoved };
  },
});

// ============================================
// PR TOOLS
// ============================================

export const createPullRequest = createTool({
  id: "create-pull-request",
  description: "Create a GitHub pull request. REQUIRES issueNumber to use correct branch.",
  inputSchema: z.object({
    title: z.string().describe("PR title"),
    body: z.string().describe("PR description in markdown"),
    issueNumber: z.number().describe("Issue number (uses branch from that worktree)"),
    baseBranch: z.string().default("main").describe("Base branch to merge into"),
    draft: z.boolean().default(false).describe("Create as draft PR"),
  }),
  outputSchema: z.object({
    number: z.number(),
    url: z.string(),
    title: z.string(),
  }),
  execute: async (input) => {
    const cwd = getWorkingDir(input.issueNumber);
    
    if (cwd === getProjectRoot()) {
      throw new Error(`No worktree found for issue #${input.issueNumber}. Call setup-worktree first.`);
    }
    
    const args = [
      "pr", "create",
      "--title", input.title,
      "--body", input.body,
      "--base", input.baseBranch,
    ];
    
    if (input.draft) {
      args.push("--draft");
    }
    
    const { stdout } = await execFileAsync("gh", args, { cwd });
    const url = stdout.trim();
    
    // Parse PR number from URL
    const prMatch = url.match(/\/pull\/(\d+)/);
    const number = prMatch ? parseInt(prMatch[1], 10) : 0;
    
    return { number, url, title: input.title };
  },
});

export const linkPrToIssue = createTool({
  id: "link-pr-to-issue",
  description: "Link a PR to close an issue (adds 'Closes #N' to PR body)",
  inputSchema: z.object({
    prNumber: z.number().describe("PR number"),
    issueNumber: z.number().describe("Issue number to link"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
  execute: async (input) => {
    // Get current PR body
    const { stdout: prJson } = await execFileAsync("gh", [
      "pr", "view", String(input.prNumber),
      "--json", "body",
    ]);
    
    const pr = JSON.parse(prJson);
    const currentBody = pr.body || "";
    
    // Check if already linked
    if (currentBody.includes(`Closes #${input.issueNumber}`) || 
        currentBody.includes(`Fixes #${input.issueNumber}`)) {
      return { success: true };
    }
    
    // Append closing reference
    const newBody = `${currentBody}\n\nCloses #${input.issueNumber}`;
    
    await execFileAsync("gh", [
      "pr", "edit", String(input.prNumber),
      "--body", newBody,
    ]);
    
    return { success: true };
  },
});

// Export all tools
export const codeTools = {
  // Worktree management
  setupWorktree,
  cleanupWorktree,
  // File tools
  readFileContent,
  writeFileContent,
  listDirectory,
  searchFiles,
  // Git tools
  gitStatus,
  gitCommit,
  gitPush,
  gitDiff,
  // PR tools
  createPullRequest,
  linkPrToIssue,
};

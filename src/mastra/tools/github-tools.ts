import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Helper to run gh CLI commands (uses execFile to avoid shell escaping issues)
async function runGhCommand(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gh", args);
    return stdout.trim();
  } catch (error: any) {
    throw new Error(`GitHub CLI error: ${error.stderr || error.message}`);
  }
}

// Get current repo from git remote
async function getCurrentRepo(): Promise<string> {
  const { stdout } = await execFileAsync("gh", [
    "repo", "view",
    "--json", "nameWithOwner",
    "-q", ".nameWithOwner"
  ]);
  return stdout.trim();
}

export const listIssues = createTool({
  id: "list-github-issues",
  description: "List open GitHub issues in the current repository",
  inputSchema: z.object({
    state: z.enum(["open", "closed", "all"]).default("open").describe("Filter by issue state"),
    labels: z.array(z.string()).optional().describe("Filter by labels"),
    limit: z.number().default(30).describe("Maximum number of issues to return"),
  }),
  outputSchema: z.object({
    issues: z.array(z.object({
      number: z.number(),
      title: z.string(),
      state: z.string(),
      labels: z.array(z.string()),
      assignees: z.array(z.string()),
      url: z.string(),
    })),
  }),
  execute: async (input) => {
    const args = [
      "issue", "list",
      "--state", input.state,
      "--limit", String(input.limit),
      "--json", "number,title,state,labels,assignees,url",
    ];

    if (input.labels && input.labels.length > 0) {
      args.push("--label", input.labels.join(","));
    }

    const output = await runGhCommand(args);
    const issues = JSON.parse(output || "[]");

    return {
      issues: issues.map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        labels: issue.labels?.map((l: any) => l.name) || [],
        assignees: issue.assignees?.map((a: any) => a.login) || [],
        url: issue.url,
      })),
    };
  },
});

export const createIssue = createTool({
  id: "create-github-issue",
  description: "Create a new GitHub issue in the current repository. Use this to create actionable tasks from user ideas.",
  inputSchema: z.object({
    title: z.string().describe("Issue title - should be clear and actionable"),
    body: z.string().describe("Issue body/description in markdown. Include acceptance criteria."),
    labels: z.array(z.string()).optional().describe("Labels to add (e.g., ['priority:high', 'type:feature'])"),
    assignees: z.array(z.string()).optional().describe("GitHub usernames to assign"),
  }),
  outputSchema: z.object({
    number: z.number(),
    url: z.string(),
    title: z.string(),
  }),
  execute: async (input) => {
    const args = [
      "issue", "create",
      "--title", input.title,
      "--body", input.body,
    ];

    if (input.labels && input.labels.length > 0) {
      for (const label of input.labels) {
        args.push("--label", label);
      }
    }

    if (input.assignees && input.assignees.length > 0) {
      for (const assignee of input.assignees) {
        args.push("--assignee", assignee);
      }
    }

    // Get the issue URL from creation
    const output = await runGhCommand(args);
    
    // Parse the URL to get issue number
    const urlMatch = output.match(/issues\/(\d+)/);
    const number = urlMatch ? parseInt(urlMatch[1], 10) : 0;

    return {
      number,
      url: output,
      title: input.title,
    };
  },
});

export const updateIssue = createTool({
  id: "update-github-issue",
  description: "Update an existing GitHub issue",
  inputSchema: z.object({
    issueNumber: z.number().describe("Issue number to update"),
    title: z.string().optional().describe("New title"),
    body: z.string().optional().describe("New body"),
    state: z.enum(["open", "closed"]).optional().describe("New state"),
    addLabels: z.array(z.string()).optional().describe("Labels to add"),
    removeLabels: z.array(z.string()).optional().describe("Labels to remove"),
    addAssignees: z.array(z.string()).optional().describe("Assignees to add"),
    removeAssignees: z.array(z.string()).optional().describe("Assignees to remove"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    url: z.string(),
  }),
  execute: async (input) => {
    const args = ["issue", "edit", String(input.issueNumber)];

    if (input.title) {
      args.push("--title", input.title);
    }
    if (input.body) {
      args.push("--body", input.body);
    }
    if (input.addLabels) {
      for (const label of input.addLabels) {
        args.push("--add-label", label);
      }
    }
    if (input.removeLabels) {
      for (const label of input.removeLabels) {
        args.push("--remove-label", label);
      }
    }
    if (input.addAssignees) {
      for (const assignee of input.addAssignees) {
        args.push("--add-assignee", assignee);
      }
    }
    if (input.removeAssignees) {
      for (const assignee of input.removeAssignees) {
        args.push("--remove-assignee", assignee);
      }
    }

    await runGhCommand(args);

    // Close/reopen if state change requested
    if (input.state === "closed") {
      await runGhCommand(["issue", "close", String(input.issueNumber)]);
    } else if (input.state === "open") {
      await runGhCommand(["issue", "reopen", String(input.issueNumber)]);
    }

    const repo = await getCurrentRepo();
    return {
      success: true,
      url: `https://github.com/${repo}/issues/${input.issueNumber}`,
    };
  },
});

export const getIssue = createTool({
  id: "get-github-issue",
  description: "Get details of a specific GitHub issue",
  inputSchema: z.object({
    issueNumber: z.number().describe("Issue number to fetch"),
  }),
  outputSchema: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string(),
    state: z.string(),
    labels: z.array(z.string()),
    assignees: z.array(z.string()),
    url: z.string(),
    comments: z.number(),
  }),
  execute: async (input) => {
    const args = [
      "issue", "view", String(input.issueNumber),
      "--json", "number,title,body,state,labels,assignees,url,comments",
    ];

    const output = await runGhCommand(args);
    const issue = JSON.parse(output);

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body || "",
      state: issue.state,
      labels: issue.labels?.map((l: any) => l.name) || [],
      assignees: issue.assignees?.map((a: any) => a.login) || [],
      url: issue.url,
      comments: issue.comments?.length || 0,
    };
  },
});

export const addIssueComment = createTool({
  id: "add-github-issue-comment",
  description: "Add a comment to a GitHub issue",
  inputSchema: z.object({
    issueNumber: z.number().describe("Issue number to comment on"),
    body: z.string().describe("Comment body in markdown"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    url: z.string(),
  }),
  execute: async (input) => {
    const args = [
      "issue", "comment", String(input.issueNumber),
      "--body", input.body,
    ];

    const output = await runGhCommand(args);
    
    return {
      success: true,
      url: output || `Issue #${input.issueNumber}`,
    };
  },
});

// Export all tools
export const githubTools = {
  listIssues,
  createIssue,
  updateIssue,
  getIssue,
  addIssueComment,
};

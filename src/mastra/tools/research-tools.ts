import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, mkdir, access } from "fs/promises";
import { join } from "path";

const execAsync = promisify(exec);

const FOUNDERMODE_DIR = ".foundermode";
const RESEARCH_FILE = "codebase-research.md";

// Schema for the research document
const ResearchDocumentSchema = z.object({
  generatedAt: z.string(),
  projectName: z.string(),
  summary: z.string(),
  techStack: z.array(z.string()),
  architecture: z.string(),
  keyFiles: z.array(z.object({
    path: z.string(),
    purpose: z.string(),
  })),
  patterns: z.array(z.string()),
  conventions: z.array(z.string()),
});

type ResearchDocument = z.infer<typeof ResearchDocumentSchema>;

async function getProjectRoot(): Promise<string> {
  try {
    const { stdout } = await execAsync("git rev-parse --show-toplevel");
    return stdout.trim();
  } catch {
    return process.cwd();
  }
}

async function researchDocExists(): Promise<boolean> {
  const root = await getProjectRoot();
  const researchPath = join(root, FOUNDERMODE_DIR, RESEARCH_FILE);
  try {
    await access(researchPath);
    return true;
  } catch {
    return false;
  }
}

async function gatherCodebaseInfo(): Promise<{
  packageJson: any;
  fileTree: string;
  keyFiles: { path: string; content: string }[];
}> {
  const root = await getProjectRoot();
  
  // Read package.json
  let packageJson = {};
  try {
    const content = await readFile(join(root, "package.json"), "utf-8");
    packageJson = JSON.parse(content);
  } catch {
    // No package.json
  }

  // Get file tree (excluding node_modules, .git, etc.)
  let fileTree = "";
  try {
    const { stdout } = await execAsync(
      `find . -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.json" -o -name "*.md" | grep -v node_modules | grep -v .git | grep -v dist | sort`,
      { cwd: root }
    );
    fileTree = stdout.trim();
  } catch {
    fileTree = "Unable to generate file tree";
  }

  // Read key files for context
  const keyFilePaths = [
    "package.json",
    "tsconfig.json",
    "README.md",
    "src/index.ts",
    "src/mastra/index.ts",
  ];

  const keyFiles: { path: string; content: string }[] = [];
  for (const filePath of keyFilePaths) {
    try {
      const content = await readFile(join(root, filePath), "utf-8");
      keyFiles.push({ path: filePath, content: content.slice(0, 2000) }); // Limit size
    } catch {
      // File doesn't exist
    }
  }

  // Also grab a sample of src files
  try {
    const { stdout } = await execAsync(
      `find ./src -type f \\( -name "*.ts" -o -name "*.tsx" \\) | grep -v node_modules | head -10`,
      { cwd: root }
    );
    const srcFiles = stdout.trim().split("\n").filter(Boolean);
    for (const filePath of srcFiles) {
      if (!keyFiles.some(f => f.path === filePath)) {
        try {
          const content = await readFile(join(root, filePath), "utf-8");
          keyFiles.push({ path: filePath, content: content.slice(0, 1500) });
        } catch {
          // Skip
        }
      }
    }
  } catch {
    // No src directory
  }

  return { packageJson, fileTree, keyFiles };
}

export const checkResearchDocument = createTool({
  id: "check-research-document",
  description: "Check if a codebase research document exists in the .foundermode folder",
  inputSchema: z.object({}),
  outputSchema: z.object({
    exists: z.boolean(),
    path: z.string(),
    content: z.string().optional(),
  }),
  execute: async () => {
    const root = await getProjectRoot();
    const researchPath = join(root, FOUNDERMODE_DIR, RESEARCH_FILE);
    const exists = await researchDocExists();
    
    let content: string | undefined;
    if (exists) {
      content = await readFile(researchPath, "utf-8");
    }

    return {
      exists,
      path: researchPath,
      content,
    };
  },
});

export const generateResearchDocument = createTool({
  id: "generate-research-document",
  description: "Analyze the codebase and generate a deep research document. Call this when no research document exists.",
  inputSchema: z.object({
    additionalContext: z.string().optional().describe("Any additional context about the project"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    summary: z.string(),
  }),
  execute: async (input) => {
    const root = await getProjectRoot();
    const founderModeDir = join(root, FOUNDERMODE_DIR);
    const researchPath = join(founderModeDir, RESEARCH_FILE);

    // Gather codebase information
    const { packageJson, fileTree, keyFiles } = await gatherCodebaseInfo();

    // Build the research document content
    const projectName = (packageJson as any).name || "Unknown Project";
    const dependencies = Object.keys((packageJson as any).dependencies || {});
    const devDependencies = Object.keys((packageJson as any).devDependencies || {});

    const researchContent = `# Codebase Research: ${projectName}

> Generated: ${new Date().toISOString()}
> This document is auto-generated by Founder Mode to help the Product Visionary understand the codebase.

## Project Overview

**Name:** ${projectName}
**Description:** ${(packageJson as any).description || "No description provided"}

${input.additionalContext ? `### Additional Context\n${input.additionalContext}\n` : ""}

## Tech Stack

### Dependencies
${dependencies.map(d => `- ${d}`).join("\n") || "- None"}

### Dev Dependencies
${devDependencies.map(d => `- ${d}`).join("\n") || "- None"}

## File Structure

\`\`\`
${fileTree}
\`\`\`

## Key Files

${keyFiles.map(f => `### ${f.path}
\`\`\`
${f.content}
\`\`\`
`).join("\n")}

## Architecture Notes

Based on the codebase analysis:
- This appears to be a ${dependencies.includes("@mastra/core") ? "Mastra-based AI agent" : "TypeScript"} project
- ${dependencies.includes("@opentui/solid") ? "Uses OpenTUI for terminal UI" : ""}
- ${dependencies.includes("solid-js") ? "Uses SolidJS for reactivity" : ""}

## Conventions

- File naming: kebab-case for files
- Export patterns: Named exports preferred
- TypeScript: Strict mode enabled

---
*Regenerate this document by asking the Product Visionary to refresh the codebase research.*
`;

    // Ensure .foundermode directory exists
    await mkdir(founderModeDir, { recursive: true });
    
    // Write the research document
    await writeFile(researchPath, researchContent, "utf-8");

    return {
      success: true,
      path: researchPath,
      summary: `Generated research document for ${projectName} with ${keyFiles.length} key files analyzed.`,
    };
  },
});

export const readResearchDocument = createTool({
  id: "read-research-document",
  description: "Read the codebase research document to understand the project context",
  inputSchema: z.object({}),
  outputSchema: z.object({
    exists: z.boolean(),
    content: z.string(),
  }),
  execute: async () => {
    const root = await getProjectRoot();
    const researchPath = join(root, FOUNDERMODE_DIR, RESEARCH_FILE);
    
    try {
      const content = await readFile(researchPath, "utf-8");
      return { exists: true, content };
    } catch {
      return { 
        exists: false, 
        content: "No research document found. Use generate-research-document to create one." 
      };
    }
  },
});

export const researchTools = {
  checkResearchDocument,
  generateResearchDocument,
  readResearchDocument,
};

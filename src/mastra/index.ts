import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { productVisionaryAgent } from './agents/product-visionary';
import { engineerAgent } from './agents/engineer';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { tuiLogger } from '../tui/stores/logStore';

// Storage persisted to .foundermode directory
const storage = new LibSQLStore({
  id: "founder-mode-storage",
  url: "file:.foundermode/mastra.db",
});

export const mastra = new Mastra({
  workflows: { weatherWorkflow },
  agents: { 
    weatherAgent,
    productVisionaryAgent,
    engineerAgent,
  },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  storage,
  logger: tuiLogger,
});

// Export storage for direct access
export { storage };

// Export agents for direct use in TUI
export { productVisionaryAgent } from './agents/product-visionary';
export { engineerAgent } from './agents/engineer';

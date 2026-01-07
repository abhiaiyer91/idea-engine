import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { productVisionaryAgent } from './agents/product-visionary';
import { engineerAgent } from './agents/engineer';

// Storage persisted to .foundermode directory
const storage = new LibSQLStore({
  id: "founder-mode-storage",
  url: "file:.foundermode/mastra.db",
});

export const mastra = new Mastra({
  agents: { 
    productVisionaryAgent,
    engineerAgent,
  },
  storage,
});

// Export storage for direct access
export { storage };

// Export agents for direct use
export { productVisionaryAgent } from './agents/product-visionary';
export { engineerAgent } from './agents/engineer';

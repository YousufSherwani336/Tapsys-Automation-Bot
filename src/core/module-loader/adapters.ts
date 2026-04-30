import type { LoadedModule } from '../../types/index.js';
import type { ToolRegistry } from '../agent-runtime/toolRegistry.js';
import { applyJiraModule } from '../../shared-modules/jira-core/orgAdapter.js';
import { applyDataReportingModule } from '../../shared-modules/data-reporting/orgAdapter.js';

export interface AdapterArgs {
  loadedModule: LoadedModule;
  orgEnv: Record<string, string>;
  registry: ToolRegistry;
}

export type AdapterFn = (args: AdapterArgs) => void;

/**
 * Maps module folder names to their adapter functions.
 * Future modules slot in here without changes elsewhere.
 */
export const MODULE_ADAPTERS: Record<string, AdapterFn> = {
  jira: applyJiraModule,
  data_reporting: applyDataReportingModule,
};

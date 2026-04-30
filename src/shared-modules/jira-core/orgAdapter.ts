import pino from 'pino';
import type { LoadedModule } from '../../types/index.js';
import type { ToolRegistry } from '../../core/agent-runtime/toolRegistry.js';
import { createJiraClient } from './client.js';
import { JIRA_TOOL_BUILDERS } from './toolBuilders.js';

const rootLogger = pino({ name: 'jira-org-adapter' });

const SUPPORTED_TOOL_NAMES = Object.keys(JIRA_TOOL_BUILDERS);

export interface ApplyJiraModuleArgs {
  loadedModule: LoadedModule;
  orgEnv: Record<string, string>;
  registry: ToolRegistry;
}

/**
 * Wires the org's Jira module into the tool registry.
 * Only tools explicitly listed in manifest.tools are registered (allowlist model).
 * Throws at startup if any listed tool name is unknown or required env vars are missing.
 */
export function applyJiraModule({ loadedModule, orgEnv, registry }: ApplyJiraModuleArgs): void {
  const log = rootLogger.child({ subsystem: 'jira-org-adapter', module: loadedModule.name });

  if (!loadedModule.manifest.enabled) {
    log.info('Jira module is disabled — skipping registration');
    return;
  }

  const host = orgEnv['JIRA_HOST'];
  const email = orgEnv['JIRA_EMAIL'];
  const token = orgEnv['JIRA_TOKEN'];

  if (!host) {
    throw new Error('Jira module is enabled but JIRA_HOST is missing from org env');
  }
  if (!email) {
    throw new Error('Jira module is enabled but JIRA_EMAIL is missing from org env');
  }
  if (!token) {
    throw new Error('Jira module is enabled but JIRA_TOKEN is missing from org env');
  }

  const client = createJiraClient({ host, email, token });

  // --- DEBUG TEST ---
  // Attempt to fetch PIT-9226 to verify credentials
  client.http.get('/issue/PIT-9226')
    .then(res => {
      log.info({ status: res.status, key: res.data.key }, 'Successfully fetched PIT-9226 during initialization test');
    })
    .catch(err => {
      log.error({ 
        status: err.response?.status, 
        data: err.response?.data, 
        message: err.message 
      }, 'Failed to fetch PIT-9226 during initialization test');
    });
  // ------------------

  const ctx = {
    client,
    // defaults and vocabulary come directly from the loaded module files
    defaults: loadedModule.defaults as import('./toolBuilders.js').JiraDefaults,
    vocabulary: loadedModule.vocabulary as import('./toolBuilders.js').JiraVocabulary,
  };

  const registeredNames: string[] = [];

  for (const toolName of loadedModule.manifest.tools) {
    const builder = JIRA_TOOL_BUILDERS[toolName];
    if (!builder) {
      throw new Error(
        `Unknown Jira tool "${toolName}" in manifest.tools. ` +
          `Supported tool names: ${SUPPORTED_TOOL_NAMES.join(', ')}`,
      );
    }
    const tool = builder(ctx);
    registry.register(tool);
    registeredNames.push(toolName);
  }

  log.info({ module: loadedModule.name, registeredTools: registeredNames }, 'Jira module registered tools');
}

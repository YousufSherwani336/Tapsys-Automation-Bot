import pino from 'pino';
import type { LoadedModule } from '../../types/index.js';
import type { ToolRegistry } from '../agent-runtime/toolRegistry.js';
import { MODULE_ADAPTERS } from './adapters.js';

const rootLogger = pino({ name: 'module-loader' });

/**
 * Runs the adapter for every loaded module and registers its tools into the registry.
 * Throws immediately (fail-closed) if a module's folder name has no registered adapter.
 */
export function registerModules(
  loadedModules: LoadedModule[],
  orgEnv: Record<string, string>,
  registry: ToolRegistry,
): void {
  const log = rootLogger.child({ subsystem: 'register-modules' });

  const knownAdapters = Object.keys(MODULE_ADAPTERS);

  for (const loadedModule of loadedModules) {
    if (!loadedModule.manifest.enabled) {
      log.info({ module: loadedModule.name }, `Module "${loadedModule.name}" is disabled — skipping`);
      continue;
    }

    const adapter = MODULE_ADAPTERS[loadedModule.name];
    if (!adapter) {
      throw new Error(
        `Unknown module type "${loadedModule.name}". ` +
          `Known module types: ${knownAdapters.join(', ')}`,
      );
    }
    adapter({ loadedModule, orgEnv, registry });
    log.info(
      { module: loadedModule.name, registeredTools: registry.names() },
      `Module "${loadedModule.name}" registered`,
    );
  }
}

import pino from 'pino';
import { discoverModules } from './discover.js';
import { loadModule } from './loadModule.js';
import type { OrgContext, LoadedModule } from '../../types/index.js';

const rootLogger = pino({ name: 'module-loader' });

export async function loadOrgModules(orgContext: OrgContext): Promise<LoadedModule[]> {
  const log = rootLogger.child({ org: orgContext.slug, subsystem: 'module-loader' });

  const moduleNames = await discoverModules(orgContext.rootDir);
  const modules = await Promise.all(
    moduleNames.map(name => loadModule(orgContext.rootDir, name)),
  );

  log.info({ modules: modules.map(m => m.name) }, 'Loaded org modules');
  return modules;
}

export type { LoadedModule };

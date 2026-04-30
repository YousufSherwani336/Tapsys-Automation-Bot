// Cross-module types for the whatsapp-org-agent platform.
// Plan-local types stay in their own folder; everything shared lives here.

import { z } from 'zod';
import type { OrgConfig } from '../core/config/schema.js';
import { ModuleManifestSchema } from '../core/module-loader/schemas.js';

export type { OrgConfig };

export interface OrgContext {
  slug: string;
  rootDir: string;
  sessionDir: string;
  runtimeDir: string;
  config: OrgConfig;
  /** Scoped env vars loaded from orgs/<slug>/.env — NOT from global process.env */
  env: Record<string, string>;
  systemPrompt: string;
}

/** Inferred from ModuleManifestSchema — defined by plan 03 */
export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

export interface LoadedModule {
  name: string;
  manifest: ModuleManifest;
  prompt: string;
  defaults: Record<string, unknown>;
  vocabulary: Record<string, unknown>;
}

/** Defined by plan 05 (agent-runtime). */
export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: import('zod').ZodType<I>;
  handler: (input: I) => Promise<O>;
}

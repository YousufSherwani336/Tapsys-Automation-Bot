import { z } from 'zod';

export const ModuleManifestSchema = z.object({
  enabled: z.boolean(),
  tools: z.array(z.string()),
});

// Loader is permissive — each module defines its own shape.
export const ModuleDefaultsSchema = z.record(z.unknown());
export const ModuleVocabularySchema = z.record(z.unknown());

import type { LoadedModule } from '../../types/index.js';

export interface ComposePromptOptions {
  basePrompt: string;
  orgPrompt: string;
  modules: LoadedModule[];
}

/**
 * Pure function: composes the final system prompt from base + org + per-module prompts.
 * Sections are separated by a blank line; output ends with exactly one newline.
 * Modules are sorted by name for stable ordering.
 */
export function composeSystemPrompt({
  basePrompt,
  orgPrompt,
  modules,
}: ComposePromptOptions): string {
  const normalize = (s: string): string =>
    s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  const sections: string[] = [];

  sections.push(normalize(basePrompt));
  sections.push(`## Organization\n${normalize(orgPrompt)}`);

  const sorted = [...modules].sort((a, b) => a.name.localeCompare(b.name));
  for (const mod of sorted) {
    sections.push(`## Module: ${mod.name}\n${normalize(mod.prompt)}`);
  }

  return sections.join('\n\n') + '\n';
}

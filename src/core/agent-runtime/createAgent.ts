/**
 * Pi SDK: @mariozechner/pi-agent-core ^0.70.2 + @mariozechner/pi-ai ^0.70.2
 * TypeBox helpers are imported via @mariozechner/pi-ai which re-exports them.
 * Tool parameters are converted from Zod schemas using zod-to-json-schema and
 * wrapped with Type.Unsafe() to produce proper TypeBox schema objects that
 * satisfy @mariozechner/pi-ai's validateToolArguments at runtime.
 *
 * Deviation from plan: `model` is an optional parameter not in the original
 * plan spec. It is required by the Pi SDK and cannot be inferred from
 * { systemPrompt, tools } alone. Plan 10 (bootstrap) should pass the org's
 * configured model; the default here is Claude Sonnet 4 via Anthropic.
 */
import { Agent as PiAgent } from '@mariozechner/pi-agent-core';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type, getModel } from '@mariozechner/pi-ai';
import type { Model } from '@mariozechner/pi-ai';
import { getOAuthApiKey } from '@mariozechner/pi-ai/oauth';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ToolDefinition } from '../../types/index.js';
import { BLOCKED_TOOL_NAMES } from './toolRegistry.js';

/** Minimal interface for a running Pi agent session. */
export interface Agent {
  sendMessage(text: string): Promise<string>;
}

export interface CreateAgentOptions {
  systemPrompt: string;
  tools: ToolDefinition[];
  /**
   * Pi AI model to use.
   * Defaults to claude-sonnet-4-20250514 via Anthropic.
   * Plan 10 (bootstrap) should pass the org-configured model.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model?: Model<any>;
  /** Scoped environment variables for API key lookup */
  env?: Record<string, string>;
}

/**
 * Creates an isolated Pi agent session.
 *
 * - Only the supplied tools are registered; no auto-discovery (README §15).
 * - Blocked tool names are rejected before the session is created (defense in
 *   depth — README §2.4).
 * - In-memory conversation state is maintained per agent instance (README §3).
 */
export async function createAgent({
  systemPrompt,
  tools,
  model,
  env = {},
}: CreateAgentOptions): Promise<Agent> {
  // Defense in depth: reject blocked names even if the caller bypassed
  // ToolRegistry.register() (README §10.4).
  for (const tool of tools) {
    if (BLOCKED_TOOL_NAMES.has(tool.name)) {
      throw new Error(
        `Tool name "${tool.name}" is blocked (coding-tool ban — README §2.4).`,
      );
    }
  }

  // Convert each ToolDefinition (Zod-based) to an AgentTool (TypeBox-based).
  // zod-to-json-schema produces a standard JSON schema object; Type.Unsafe()
  // wraps it with the TypeBox Kind symbol so @mariozechner/pi-ai's runtime
  // validator (validateToolArguments) recognises it as a proper TypeBox schema.
  const agentTools: AgentTool<ReturnType<typeof Type.Unsafe>>[] = tools.map(
    (tool) => {
      const jsonSchema = zodToJsonSchema(tool.inputSchema, {
        $refStrategy: 'none',
      });
      // Type.Unsafe() is the TypeBox escape hatch for plain JSON schema objects.
      // The cast is correct because TypeBox schemas ARE JSON schema objects
      // enriched with the TypeBox.Kind symbol, which Unsafe adds for us.
      const typeboxSchema = Type.Unsafe(jsonSchema);

      // Sanitize the tool name to comply with OpenAI's strict regex: ^[a-zA-Z0-9_-]+$
      const safeName = tool.name.replace(/[^a-zA-Z0-9_-]/g, '_');

      return {
        name: safeName,
        // label is required by AgentTool for UI display; keep original if possible, 
        // or just use safeName. AgentTool requires label to be string.
        label: tool.name,
        description: tool.description,
        parameters: typeboxSchema,
        execute: async (
          _toolCallId: string,
          params: unknown,
        ) => {
          const result = await tool.handler(
            // params is the validated input from the Pi SDK; typed as unknown
            // here because the Zod schema is generic.
            params as Parameters<typeof tool.handler>[0],
          );
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            // details is required by AgentToolResult; not surfaced to callers.
            details: {},
          };
        },
      };
    },
  );

  const resolvedModel =
    model ?? getModel('anthropic', 'claude-sonnet-4-20250514');

  const piAgent = new PiAgent({
    initialState: {
      systemPrompt,
      model: resolvedModel,
      tools: agentTools,
    },
    getApiKey: async (provider) => {
      // 1. Try reading from auth.json (from OAuth login flow)
      try {
        const authPath = join(process.cwd(), 'auth.json');
        const authRaw = await readFile(authPath, 'utf8');
        const authObj = JSON.parse(authRaw);

        if (authObj[provider]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await getOAuthApiKey(provider as any, authObj);
          if (result) {
            // Write back in case the token was refreshed
            authObj[provider] = { type: 'oauth', ...result.newCredentials };
            await writeFile(authPath, JSON.stringify(authObj, null, 2), 'utf8');
            // GitHub Copilot requires dynamic baseUrl routing based on the token
            if (provider === 'github-copilot' && resolvedModel.provider === 'github-copilot') {
              const match = result.apiKey.match(/proxy-ep=([^;]+)/);
              resolvedModel.baseUrl = match
                ? `https://${match[1].replace(/^proxy\./, 'api.')}`
                : 'https://api.individual.githubcopilot.com';
            }

            return result.apiKey;
          }
        }
      } catch (err) {
        // ignore missing or malformed auth.json
      }

      // 2. Fall back to scoped environment variables
      const envMap: Record<string, string[]> = {
        'github-copilot': ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'],
        'anthropic': ['ANTHROPIC_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'],
        'openai': ['OPENAI_API_KEY'],
        'azure-openai-responses': ['AZURE_OPENAI_API_KEY'],
        'deepseek': ['DEEPSEEK_API_KEY'],
        'google': ['GEMINI_API_KEY'],
        'google-vertex': ['GOOGLE_CLOUD_API_KEY'],
        'groq': ['GROQ_API_KEY'],
        'cerebras': ['CEREBRAS_API_KEY'],
        'xai': ['XAI_API_KEY'],
        'openrouter': ['OPENROUTER_API_KEY'],
        'vercel-ai-gateway': ['AI_GATEWAY_API_KEY'],
        'zai': ['ZAI_API_KEY'],
        'mistral': ['MISTRAL_API_KEY'],
        'minimax': ['MINIMAX_API_KEY'],
        'minimax-cn': ['MINIMAX_CN_API_KEY'],
        'huggingface': ['HF_TOKEN'],
        'fireworks': ['FIREWORKS_API_KEY'],
        'opencode': ['OPENCODE_API_KEY'],
        'opencode-go': ['OPENCODE_API_KEY'],
        'kimi-coding': ['KIMI_API_KEY'],
      };

      const keys = envMap[provider];
      let foundKey: string | undefined = undefined;

      if (keys) {
        for (const key of keys) {
          if (env[key]) {
            foundKey = env[key];
            break;
          }
        }
      }

      if (foundKey && provider === 'github-copilot' && resolvedModel.provider === 'github-copilot') {
        const match = foundKey.match(/proxy-ep=([^;]+)/);
        resolvedModel.baseUrl = match
          ? `https://${match[1].replace(/^proxy\./, 'api.')}`
          : 'https://api.individual.githubcopilot.com';
      }

      return foundKey;
    },
  });

  return {
    async sendMessage(text: string): Promise<string> {
      await piAgent.prompt(text);

      if (piAgent.state.errorMessage) {
        throw new Error(piAgent.state.errorMessage);
      }

      // Walk messages in reverse to find the last completed assistant turn.
      const messages = piAgent.state.messages;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role !== 'assistant') continue;

        // AssistantMessage.content is (TextContent | ThinkingContent | ToolCall)[].
        // We collect only TextContent items and join them.
        const content = (
          msg as { role: 'assistant'; content: { type: string; text?: string }[] }
        ).content;

        const text = content
          .filter(
            (c): c is { type: 'text'; text: string } =>
              c.type === 'text' && typeof c.text === 'string',
          )
          .map((c) => c.text)
          .join('');

        if (text.length > 0) return text;
      }

      console.error('No text response found. Messages:', JSON.stringify(piAgent.state.messages, null, 2));
      throw new Error('No text response received from Pi agent.');
    },
  };
}

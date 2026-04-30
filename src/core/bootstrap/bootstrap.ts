import pino from 'pino';
import { resolve as pathResolve } from 'node:path';
import { access, stat } from 'node:fs/promises';
import { getModel } from '@mariozechner/pi-ai';
import type { KnownProvider, Model } from '@mariozechner/pi-ai';
import { loadOrgConfig } from '../config/index.js';
import { loadOrgModules } from '../module-loader/index.js';
import { BASE_PROMPT, composeSystemPrompt } from '../agent-runtime/index.js';
import { ToolRegistry } from '../agent-runtime/index.js';
import { createAgent } from '../agent-runtime/index.js';
import type { Agent } from '../agent-runtime/index.js';
import { registerModules } from '../module-loader/registerModules.js';
import { connectWhatsApp } from '../whatsapp/index.js';
import type { WhatsAppConnection } from '../whatsapp/index.js';
import { SequentialQueue } from '../queue/sequentialQueue.js';
import type { NormalizedMessage } from '../whatsapp/index.js';
import type { OrgContext } from '../../types/index.js';

const logger = pino({ name: 'bootstrap' });

/** Structured response that the LLM agent returns as its final text. */
interface AgentResponse {
  type: 'image' | 'clarification' | 'text' | 'last_report' | 'error';
  imagePath?: string;
  caption?: string;
  message?: string;
}

/**
 * Parses the LLM's reply string into a structured AgentResponse.
 * The LLM is instructed (via system prompt) to always end its reply with a JSON block.
 *
 * Strategy: scan from the end of the string backwards to find the last `{...}` block
 * that is valid JSON and has a `type` field we recognise. This is more robust than a
 * greedy regex when the LLM writes text before the JSON.
 */
function parseAgentReply(reply: string): AgentResponse | null {
  // Find all positions of '{' characters and try to parse from last to first.
  const positions: number[] = [];
  for (let i = 0; i < reply.length; i++) {
    if (reply[i] === '{') positions.push(i);
  }

  // Iterate from the last `{` backwards — we want the LAST JSON block in the reply.
  for (let i = positions.length - 1; i >= 0; i--) {
    const candidate = reply.slice(positions[i]);
    // Find the matching closing brace by scanning forward
    const closeIdx = findMatchingClose(candidate);
    if (closeIdx === -1) continue;
    const jsonStr = candidate.slice(0, closeIdx + 1);
    try {
      const parsed = JSON.parse(jsonStr) as AgentResponse;
      if (parsed && typeof parsed.type === 'string') {
        return parsed;
      }
    } catch {
      // not valid JSON, try next position
    }
  }
  return null;
}

/** Returns the index of the `}` that closes the first `{` in str, or -1. */
function findMatchingClose(str: string): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export interface RunningOrgAgent {
  orgContext: OrgContext;
  wa: WhatsAppConnection;
  queue: SequentialQueue<NormalizedMessage>;
  agent: Agent;
  shutdown(): Promise<void>;
}

/**
 * Full startup sequence for one org agent:
 *   1. Load org config + env
 *   2. Discover and load modules
 *   3. Compose the system prompt
 *   4. Build tool registry from module adapters
 *   5. Resolve Pi model + create the agent session
 *   6. Open WhatsApp connection
 *   7. Wire queue + message handler
 */
export async function bootstrap(): Promise<RunningOrgAgent> {
  // Step 1 — config
  const orgContext = await loadOrgConfig();

  const dryRun = (orgContext.env['WHATSAPP_DRY_RUN'] ?? 'true') !== 'false';
  if (dryRun) {
    logger.warn({ org: orgContext.slug }, 'DRY_RUN mode is ON — WhatsApp image/messages will NOT be sent');
  }

  // Step 2 — modules
  const loadedModules = await loadOrgModules(orgContext);

  // Only enabled modules contribute to the system prompt and tool registry.
  const enabledModules = loadedModules.filter(m => m.manifest.enabled);

  // Step 3 — compose system prompt (base + org overlay + module snippets)
  const systemPrompt = composeSystemPrompt({
    basePrompt: BASE_PROMPT,
    orgPrompt: orgContext.systemPrompt,
    modules: enabledModules,
  });

  // Step 4 — tool registry
  const registry = new ToolRegistry();
  registerModules(enabledModules, orgContext.env, registry);

  // Step 5 — Pi agent
  const provider = (orgContext.env['PI_MODEL_PROVIDER'] ?? 'anthropic') as KnownProvider;
  const modelName = orgContext.env['PI_MODEL_NAME'] ?? 'claude-sonnet-4-20250514';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (getModel as (p: KnownProvider, m: string) => Model<any>)(provider, modelName);

  const agent = await createAgent({ systemPrompt, tools: registry.list(), model, env: orgContext.env });

  // Step 6 — WhatsApp
  const wa = await connectWhatsApp(orgContext);

  // Step 7 — queue processor
  const queue = new SequentialQueue<NormalizedMessage>(
    async (msg) => {
      logger.debug({ org: orgContext.slug, from: msg.from }, 'processing message');

      // ── Typing indicator: start composing presence ──
      let typingInterval: ReturnType<typeof setInterval> | null = null;
      const startTyping = () => {
        wa.sendPresenceUpdate('composing', msg.from);
        typingInterval = setInterval(() => {
          wa.sendPresenceUpdate('composing', msg.from);
        }, 9_000); // refresh every 9s
      };
      const stopTyping = () => {
        if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
        wa.sendPresenceUpdate('paused', msg.from);
      };

      startTyping();
      try {
        const reply = await agent.sendMessage(msg.text);
        await dispatchReply({ reply, msg, wa, dryRun, org: orgContext.slug });
      } finally {
        stopTyping();
      }
    },
    { logger: logger.child({ org: orgContext.slug, subsystem: 'queue' }) },
  );

  // Step 8 — route incoming messages into the queue
  wa.onMessage((msg) => queue.enqueue(msg));

  logger.info(
    {
      org: orgContext.slug,
      modules: enabledModules.map((m) => m.name),
      tools: registry.names(),
      dryRun,
    },
    'bootstrap complete',
  );

  async function shutdown(): Promise<void> {
    logger.info({ org: orgContext.slug }, 'shutdown initiated');

    const DRAIN_TIMEOUT_MS = 10_000;
    await Promise.race([
      queue.drain(),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          logger.warn({ org: orgContext.slug }, 'drain timed out after 10s — proceeding with close');
          resolve();
        }, DRAIN_TIMEOUT_MS),
      ),
    ]);

    await wa.close();
    logger.info({ org: orgContext.slug }, 'shutdown complete');
  }

  return { orgContext, wa, queue, agent, shutdown };
}

/**
 * Dispatches the agent's reply to WhatsApp.
 * Handles image, text, clarification, last_report, and error response types.
 * In dry-run mode: logs instead of sending to real WhatsApp.
 */
async function dispatchReply(opts: {
  reply: string;
  msg: NormalizedMessage;
  wa: WhatsAppConnection;
  dryRun: boolean;
  org: string;
}): Promise<void> {
  const { reply, msg, wa, dryRun, org } = opts;

  const parsed = parseAgentReply(reply);

  if (!parsed) {
    // Safety net: LLM embedded a report image path in natural-language text instead of returning JSON.
    // Detect `output/reports/report_<timestamp>.png` anywhere in the reply and send as image.
    const pathMatch = reply.match(/output\/reports\/report_\d+\.png/);
    if (pathMatch) {
      const imagePath = pathMatch[0];
      // Use text before the path as caption; append text after the path (e.g. follow-up question).
      const splitIdx = reply.indexOf(imagePath);
      const pre = reply.slice(0, splitIdx).replace(/\(?\s*$/, '').trim();
      const post = reply.slice(splitIdx + imagePath.length).replace(/^\s*\)?/, '').trim();
      const caption = [pre, post].filter(Boolean).join('\n\n');
      logger.warn({ org, from: msg.from, imagePath }, 'Image path detected in LLM text — sending as image (fallback)');
      await sendImageSafely(wa, msg.from, imagePath, caption, dryRun, org);
      return;
    }
    // Fallback: send raw text if LLM didn't return structured JSON
    if (dryRun) {
      logger.info({ org, from: msg.from, preview: reply.slice(0, 120) }, '[DRY_RUN] Would send text');
    } else {
      await wa.sendText(msg.from, reply);
    }
    return;
  }

  switch (parsed.type) {
    case 'image': {
      if (!parsed.imagePath) {
        await dispatchText(wa, msg.from, 'Report generated but image path missing.', dryRun, org);
        return;
      }
      await sendImageSafely(wa, msg.from, parsed.imagePath, parsed.caption ?? '', dryRun, org);
      break;
    }

    case 'clarification':
    case 'text':
    case 'error': {
      const text = parsed.message ?? reply;
      await dispatchText(wa, msg.from, text, dryRun, org);
      break;
    }

    case 'last_report': {
      // Memory lookup for last report is handled by the agent via get_memory tool.
      // If it returns last_report type without calling memory, fall back to text.
      await dispatchText(wa, msg.from, 'Please ask again — I could not retrieve the last report.', dryRun, org);
      break;
    }

    default: {
      await dispatchText(wa, msg.from, reply, dryRun, org);
    }
  }
}

/**
 * Resolves image path, verifies file exists, and sends via WhatsApp.
 * Includes full diagnostic logging for debugging image send failures.
 */
async function sendImageSafely(
  wa: WhatsAppConnection,
  jid: string,
  imagePath: string,
  caption: string,
  dryRun: boolean,
  org: string,
): Promise<void> {
  // Resolve to absolute path from process.cwd()
  const resolvedPath = pathResolve(process.cwd(), imagePath);
  logger.info({ org, jid, imagePath, resolvedPath }, '[IMAGE_DIAG] Attempting to send image');

  // Verify file exists and has content
  try {
    await access(resolvedPath);
  } catch {
    logger.error({ org, jid, imagePath, resolvedPath }, '[IMAGE_DIAG] File does NOT exist');
    await wa.sendText(jid, 'Report image generate ho gayi thi, lekin file disk par nahi mili. Admin logs check kar raha hai.');
    return;
  }

  const fileStat = await stat(resolvedPath);
  logger.info({ org, jid, resolvedPath, sizeBytes: fileStat.size }, '[IMAGE_DIAG] File exists');

  if (fileStat.size === 0) {
    logger.error({ org, jid, resolvedPath }, '[IMAGE_DIAG] File is empty (0 bytes)');
    await wa.sendText(jid, 'Report image generate ho gayi thi, lekin file empty hai. Admin logs check kar raha hai.');
    return;
  }

  if (dryRun) {
    logger.info({ org, jid, resolvedPath, caption, sizeBytes: fileStat.size }, '[DRY_RUN] Would send image');
    await wa.sendText(jid, `[DRY_RUN] Report ready: ${imagePath}\nCaption: ${caption}`);
    return;
  }

  // Send image with error handling
  try {
    logger.info({ org, jid, resolvedPath }, '[IMAGE_DIAG] Calling wa.sendImage()');
    await wa.sendImage(jid, resolvedPath, caption);
    logger.info({ org, jid, resolvedPath }, '[IMAGE_DIAG] wa.sendImage() succeeded');
  } catch (err) {
    const errMsg = (err as Error).message ?? 'Unknown error';
    logger.error({ org, jid, resolvedPath, error: errMsg }, '[IMAGE_DIAG] wa.sendImage() FAILED');
    await wa.sendText(jid, 'Report image generate ho gayi thi, lekin WhatsApp media send fail hua. Admin logs check kar raha hai.');
  }
}

async function dispatchText(
  wa: WhatsAppConnection,
  jid: string,
  text: string,
  dryRun: boolean,
  org: string,
): Promise<void> {
  if (dryRun) {
    logger.info({ org, jid, preview: text.slice(0, 120) }, '[DRY_RUN] Would send text');
  } else {
    await wa.sendText(jid, text);
  }
}

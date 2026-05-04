import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { getOAuthApiKey } from '@mariozechner/pi-ai/oauth';
import { readFileSync, writeFileSync } from 'fs';

const authPath = './auth.json';
const authRaw = readFileSync(authPath, 'utf8');
const authObj = JSON.parse(authRaw);

const model = getModel('github-copilot', 'gpt-4.1');

const piAgent = new Agent({
  initialState: {
    systemPrompt: 'You describe images briefly. Reply in one sentence only.',
    model,
    tools: []
  },
  getApiKey: async (provider) => {
    const result = await getOAuthApiKey(provider, authObj);
    if (result) {
      authObj[provider] = { type: 'oauth', ...result.newCredentials };
      writeFileSync(authPath, JSON.stringify(authObj, null, 2), 'utf8');
      if (provider === 'github-copilot') {
        const m = result.apiKey.match(/proxy-ep=([^;]+)/);
        model.baseUrl = m
          ? 'https://' + m[1].replace(/^proxy\./, 'api.')
          : 'https://api.individual.githubcopilot.com';
      }
      return result.apiKey;
    }
  }
});

const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

console.log('Sending image prompt...');
await piAgent.prompt('What color is this 1x1 pixel image?', [
  { type: 'image', data: tinyPng, mimeType: 'image/png' }
]);

if (piAgent.state.errorMessage) {
  console.log('ERROR:', piAgent.state.errorMessage);
  process.exit(1);
}

const msgs = piAgent.state.messages;
console.log('Total messages:', msgs.length);
for (let i = msgs.length - 1; i >= 0; i--) {
  const msg = msgs[i];
  if (msg.role === 'assistant') {
    const text = msg.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');
    console.log('VISION_RESULT:', text.slice(0, 300));
    process.exit(0);
  }
}
console.log('No assistant message found');
process.exit(1);

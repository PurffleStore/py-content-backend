import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import config from '../config.js';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const key = config.openaiApiKey;
    if (!key) throw new Error('OPENAI_API_KEY is not set in .env');
    console.log(`🔑 OpenAI client init — key prefix: ${key.slice(0, 20)}... (${key.length} chars)`);
    openaiClient = new OpenAI({ apiKey: key, timeout: 90000 });
  }
  return openaiClient;
}

const IMAGE_DIR = path.join(__dirname, '..', '..', 'public', 'generated-images');
if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Generate an image using dall-e-3 (returns a URL; downloaded and saved locally).
 */
export async function generateImage(prompt) {
  const client = getOpenAIClient();
  const fullPrompt = `Children's educational illustration, colorful and friendly style: ${prompt}`;

  // ── dall-e-3 (returns URL, must download) — up to 2 tries ──
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`🎨 dall-e-3 (attempt ${attempt})…`);
      const response = await client.images.generate({
        model: 'dall-e-3',
        prompt: fullPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      }, { timeout: 90000 });
      const imageUrl = response.data[0]?.url;
      if (!imageUrl) throw new Error('dall-e-3 returned no URL');

      const filename = `${crypto.randomUUID()}.png`;
      const buffer = await downloadFile(imageUrl);
      fs.writeFileSync(path.join(IMAGE_DIR, filename), buffer);
      console.log(`✅ dall-e-3 saved: /generated-images/${filename}`);
      return `/generated-images/${filename}`;

    } catch (err) {
      lastErr = err;
      const status = err.status ?? err.statusCode ?? 0;
      // Retry on transient 500/503 errors or timeouts
      const isTimeout = err.message?.toLowerCase().includes('timeout') || err.code === 'ETIMEDOUT';
      if ((status === 500 || status === 503 || isTimeout) && attempt < 2) {
        console.warn(`   ⚠️ ${isTimeout ? 'Timeout' : 'OpenAI 500 error'} — retrying in 8s…`);
        await new Promise(r => setTimeout(r, 8000));
        continue;
      }
      break;
    }
  }
  const err2 = lastErr;
  {
    const status  = err2.status ?? err2.statusCode ?? '?';
    const errType = err2.error?.type ?? err2.type ?? 'unknown';
    const errCode = err2.error?.code ?? err2.code ?? 'unknown';

    console.error('❌ dall-e-3 image generation FAILED:');
    console.error(`   HTTP status : ${status}`);
    console.error(`   Error type  : ${errType}`);
    console.error(`   Error code  : ${errCode}`);
    console.error(`   Message     : ${err2.message}`);

    if (status === 401)
      console.error('   ⚠️  FIX → API key invalid. Regenerate at platform.openai.com/api-keys');
    else if (status === 402 || errCode === 'insufficient_quota')
      console.error('   ⚠️  FIX → Add billing credits at platform.openai.com/settings/billing');
    else if (status === 429)
      console.error('   ⚠️  FIX → Rate limit hit. Wait a minute and retry.');
    else if (errCode === 'content_policy_violation')
      console.error('   ⚠️  FIX → Prompt blocked by policy. Simplify it.');

    return null;
  }
}

/**
 * Generate multiple images sequentially (avoids rate limits).
 */
export async function generateImages(prompts, concurrency = 2) {
  const results = [];
  for (let i = 0; i < prompts.length; i += concurrency) {
    const batch = prompts.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(p => generateImage(p)));
    results.push(...batchResults);
  }
  return results;
}

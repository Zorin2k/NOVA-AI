import http from 'node:http';
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const APP_ORIGIN = 'https://appassets.androidplatform.net';
const MAX_BYTES = 24000;
const SESSION_SECONDS = 12 * 60 * 60;

function json(res, status, body, origin) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
    ...(origin === APP_ORIGIN ? { 'Access-Control-Allow-Origin': APP_ORIGIN } : {})
  });
  res.end(JSON.stringify(body));
}

function withinLimit(buckets, key, limit, windowMs, now) {
  const t = now();
  const old = buckets.get(key);
  if (!old || t - old.started >= windowMs) {
    buckets.set(key, { started: t, count: 1 });
    if (buckets.size > 10000) buckets.clear();
    return true;
  }
  old.count++;
  return old.count <= limit;
}

function secureEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}

function tokenSignature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function createSession(secret, now) {
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(now() / 1000) + SESSION_SECONDS,
    nonce: randomBytes(16).toString('hex')
  })).toString('base64url');
  return payload + '.' + tokenSignature(payload, secret);
}

function sessionValid(token, secret, now) {
  if (!token || typeof token !== 'string' || token.length > 512) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0])) return false;
  const correct = tokenSignature(parts[0], secret);
  if (!secureEquals(parts[1], correct)) return false;
  try {
    const obj = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return Number.isSafeInteger(obj.exp) && obj.exp > Math.floor(now() / 1000);
  } catch { return false; }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error('Request too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function cleanMessages(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 12) return null;
  let length = 0;
  const messages = [];
  for (const m of raw) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') ||
        typeof m.content !== 'string') return null;
    const content = m.content.trim();
    if (!content || content.length > 3000) return null;
    length += content.length;
    messages.push({ role: m.role, content });
  }
  if (length > 14000 || messages.at(-1).role !== 'user') return null;
  return messages;
}

export function createHandler({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const apiKey = env.OPENAI_API_KEY || '';
  const appPassword = env.NOVA_APP_PASSWORD || '';
  const sessionSecret = env.NOVA_SESSION_SECRET || '';
  const model = env.OPENAI_MODEL || 'gpt-6-luna';
  if (!apiKey || appPassword.length < 12 || sessionSecret.length < 32) {
    throw new Error('Set OPENAI_API_KEY, NOVA_APP_PASSWORD (12+ chars) and NOVA_SESSION_SECRET (32+ chars).');
  }
  const authBuckets = new Map();
  const chatBuckets = new Map();

  return async function handler(req, res) {
    const origin = req.headers.origin;
    const path = (req.url || '').split('?')[0];

    if (origin && origin !== APP_ORIGIN) {
      return json(res, 403, { error: 'Origin not allowed' }, origin);
    }
    if (req.method === 'OPTIONS') {
      if (origin === APP_ORIGIN) {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': APP_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '3600',
          'Vary': 'Origin'
        });
        return res.end();
      }
      return json(res, 403, { error: 'Origin not allowed' }, origin);
    }
    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { status: 'ok', service: 'Nova AI backend' }, origin);
    }

    const ip = req.socket.remoteAddress || 'unknown';
    if (req.method === 'POST' && path === '/api/login') {
      if (!withinLimit(authBuckets, ip, 8, 15 * 60 * 1000, now)) {
        return json(res, 429, { error: 'Too many login attempts. Try later.' }, origin);
      }
      let body;
      try { body = await readJson(req); }
      catch { return json(res, 400, { error: 'Invalid request' }, origin); }
      if (!secureEquals(body?.password, appPassword)) {
        return json(res, 401, { error: 'Incorrect app password' }, origin);
      }
      return json(res, 200, {
        token: createSession(sessionSecret, now),
        expiresIn: SESSION_SECONDS
      }, origin);
    }

    if (req.method === 'POST' && path === '/api/chat') {
      const bearer = req.headers.authorization || '';
      const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
      if (!sessionValid(token, sessionSecret, now)) {
        return json(res, 401, { error: 'Please connect again in Settings.' }, origin);
      }
      if (!withinLimit(chatBuckets, token.slice(-32), 25, 60 * 1000, now)) {
        return json(res, 429, { error: 'Too many messages. Try again in a minute.' }, origin);
      }
      let body;
      try { body = await readJson(req); }
      catch { return json(res, 400, { error: 'Invalid request' }, origin); }
      const messages = cleanMessages(body?.messages);
      if (!messages) return json(res, 400, { error: 'Invalid or oversized conversation.' }, origin);

      try {
        const response = await fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            store: false,
            max_output_tokens: 700,
            instructions: 'You are Nova AI, a clear, helpful Android assistant. Explain school subjects accurately and admit uncertainty. Keep answers concise unless more detail is requested.',
            input: messages
          }),
          signal: AbortSignal.timeout(45000)
        });
        if (!response.ok) {
          const status = response.status === 429 ? 429 : 502;
          const error = response.status === 429
            ? 'OpenAI rate or billing limit reached. Check your API billing.'
            : 'OpenAI service error. Verify server API key, model access and billing.';
          console.error('OpenAI request failed (HTTP ' + response.status + ')');
          return json(res, status, { error }, origin);
        }
        const data = await response.json();
        const reply = (data.output || [])
          .flatMap(item => item.content || [])
          .filter(content => content.type === 'output_text')
          .map(content => content.text || '')
          .join('\n').trim();
        if (!reply) {
          return json(res, 502, { error: 'OpenAI returned no text. Try again.' }, origin);
        }
        return json(res, 200, { reply, model }, origin);
      } catch (e) {
        console.error('Chat request failed:', e.name || 'Error');
        return json(res, 503, { error: 'AI request timed out or connection failed.' }, origin);
      }
    }
    return json(res, 404, { error: 'Not found' }, origin);
  };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  const server = http.createServer(createHandler());
  server.listen(port, '0.0.0.0', () => console.log('Nova AI backend listening on port ' + port));
}

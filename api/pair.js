// api/pair.js  –  Vercel Serverless Function
// Proxies pairing requests to your bot server running pair-server.js
//
// Set this environment variable in your Vercel project settings:
//   BOT_SERVER_URL  =  http://YOUR_PUBLIC_IP_OR_DOMAIN:3000
//   PAIR_SECRET     =  (optional, must match pair-server.js)

const allowCors = (fn) => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  return fn(req, res);
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Validate input ──────────────────────────────────────────
  let phone = (req.body?.phone || '').toString().replace(/[\s\-\+]/g, '').trim();

  if (!phone || !/^\d{7,15}$/.test(phone)) {
    return res.status(400).json({
      error: 'Invalid phone number. Use full number with country code, no + (e.g. 2347081827038)'
    });
  }

  // ── Build target URL ────────────────────────────────────────
  const botUrl = process.env.BOT_SERVER_URL?.replace(/\/$/, '');

  if (!botUrl) {
    return res.status(500).json({
      error: 'BOT_SERVER_URL is not configured. Set it in your Vercel environment variables.'
    });
  }

  const secret = process.env.PAIR_SECRET || '';
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['Authorization'] = `Bearer ${secret}`;

  // ── Proxy to bot server ─────────────────────────────────────
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 35000);

    const upstream = await fetch(`${botUrl}/pair`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ phone }),
      signal:  controller.signal,
    });

    clearTimeout(timeout);

    const contentType = upstream.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const text = await upstream.text();
      console.error('[pair proxy] Non-JSON response:', text.slice(0, 200));
      return res.status(502).json({
        error: 'Bot server returned an unexpected response. Make sure pair-server.js is running on your XMD panel.'
      });
    }

    const data = await upstream.json();

    if (!upstream.ok || !data.success) {
      return res.status(upstream.status).json({ error: data.error || 'Failed to generate pairing code.' });
    }

    return res.status(200).json({ success: true, code: data.code });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Request to bot server timed out. Make sure pair-server.js is running.' });
    }

    console.error('[pair proxy] Fetch error:', err.message);
    return res.status(502).json({
      error: `Could not reach bot server: ${err.message}. Make sure pair-server.js is running on your XMD panel.`
    });
  }
}

module.exports = allowCors(handler);

/**
 * server.js (CF-advanced, stealth + retries)
 * Endpoints:
 *   GET /ping
 *   GET /fetch?url=... [&cookie=...&ua=...&referer=...]
 *   GET /img?url=... [&referer=...&cookie=...&ua=...]
 *   GET /img-auto?url=... (uses DEFAULT_REFERER)
 *
 * Requirements (once):
 *   npm i puppeteer-extra puppeteer-extra-plugin-stealth user-agents
 */

const express = require('express');

// ---- Stealth Puppeteer setup ----
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgent = require('user-agents');
puppeteer.use(StealthPlugin());

const app = express();

// ---- CORS ----
app.use((_, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', '*');
  next();
});

// ---- Health ----
app.get('/ping', (_req, res) => res.send('pong'));

// ---- Config ----
const CHROMIUM_PATH   = '/usr/bin/chromium';
const USER_DATA_DIR   = '/root/.cache/pptr-profile';
const DEFAULT_UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36';
const DEFAULT_REFERER = 'https://bakamh.com/'; // for image proxy

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function createBrowser(uaFromReq) {
  const ua = uaFromReq || new UserAgent({ deviceCategory: 'desktop' }).toString();
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    userDataDir: USER_DATA_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 824, deviceScaleFactor: 1 });
  await page.setUserAgent(ua);

  // Important: allow CF challenge resources
  await page.setExtraHTTPHeaders({
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'upgrade-insecure-requests': '1',
  });

  return { browser, page };
}

async function passCloudflare(page, target) {
  // Try up to 4 passes
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(target, { waitUntil: 'networkidle0', timeout: 60000 });

    // If title is not CF interstitial, assume passed
    const title = (await page.title() || '').toLowerCase();
    if (!/just a moment|正在验证|please wait|请稍候/.test(title)) {
      return true;
    }

    // Give time for Turnstile/JS to run
    await sleep(8000);

    // If still challenge, try a soft reload (CF often redirects after a delay)
    const content = await page.content();
    if (/challenges\.cloudflare\.com|__cf_chl_/.test(content)) {
      // gentle reload
      await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
      await sleep(5000);
      const t2 = (await page.title() || '').toLowerCase();
      if (!/just a moment|正在验证|please wait|请稍候/.test(t2)) {
        return true;
      }
    } else {
      // not seeing challenge markers anymore
      return true;
    }
  }
  return false;
}

// ---- /fetch ----
app.get('/fetch', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('url is required');

  let browser;
  try {
    const { browser: b, page } = await createBrowser(req.query.ua);
    browser = b;

    // optional referer/cookie
    const extra = {};
    if (req.query.referer) extra['Referer'] = String(req.query.referer);
    if (req.query.cookie)  extra['Cookie']  = String(req.query.cookie);
    if (Object.keys(extra).length) await page.setExtraHTTPHeaders(extra);

    const ok = await passCloudflare(page, target);
    if (!ok) throw new Error('Cloudflare challenge not passed after retries');

    // One more settle
    await sleep(1000);
    const html = await page.content();
    res.set('content-type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send('ERR: ' + String(err && err.message ? err.message : err));
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }
});

// ---- /img ----
app.get('/img', async (req, res) => {
  try {
    const u = req.query.url;
    if (!u) return res.status(400).send('url is required');

    const headers = {
      'User-Agent': (req.query.ua && String(req.query.ua)) || DEFAULT_UA,
    };
    if (req.query.referer) headers['Referer'] = String(req.query.referer);
    if (req.query.cookie)  headers['Cookie']  = String(req.query.cookie);

    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), 20000);
    const resp = await fetch(u, { headers, signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) return res.status(resp.status).send('Upstream ' + resp.status);

    const ct = resp.headers.get('content-type') || 'application/octet-stream';
    const cd = resp.headers.get('content-disposition');
    res.set('content-type', ct);
    if (cd) res.set('content-disposition', cd);

    return resp.body.pipe(res);
  } catch (err) {
    res.status(500).send('IMG ERR: ' + String(err && err.message ? err.message : err));
  }
});

// ---- /img-auto ----
app.get('/img-auto', async (req, res) => {
  try {
    const u = req.query.url;
    if (!u) return res.status(400).send('url is required');

    const headers = {
      'User-Agent': DEFAULT_UA,
      'Referer': req.query.referer ? String(req.query.referer) : DEFAULT_REFERER,
    };

    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), 20000);
    const resp = await fetch(u, { headers, signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) return res.status(resp.status).send('Upstream ' + resp.status);

    const ct = resp.headers.get('content-type') || 'application/octet-stream';
    const cd = resp.headers.get('content-disposition');
    res.set('content-type', ct);
    if (cd) res.set('content-disposition', cd);

    return resp.body.pipe(res);
  } catch (err) {
    res.status(500).send('IMG ERR: ' + String(err) );
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server listening on http://0.0.0.0:' + PORT));

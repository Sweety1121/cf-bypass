import express from 'express';
import puppeteer from 'puppeteer-extra';
import Stealth from 'puppeteer-extra-plugin-stealth';

puppeteer.use(Stealth());

const app = express();
const PORT = process.env.PORT || 8080;

// 走你已经打通的 Clash 代理
const PROXY = process.env.PUPPETEER_PROXY || 'socks5h://127.0.0.1:7890';
// 指向 VPS 的 chromium
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';

const launchBrowser = () =>
  puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      `--proxy-server=${PROXY}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

async function fetchHTML(url, {timeoutMs = 45000} = {}) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({width: 1366, height: 824});
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36'
    );

    const tryOnce = async () => {
      await page.goto(url, {waitUntil: 'networkidle2', timeout: timeoutMs});
      // 简单挑战判定
      const title = await page.title();
      const html = await page.content();
      const challenged =
        /just a moment|请稍候|正在验证|cf-mitigated/i.test(title) ||
        /challenges\.cloudflare\.com|__cf_chl_|cf-mitigated/i.test(html);
      return {title, html, challenged};
    };

    // 至多 2 次重载
    let last = await tryOnce();
    if (last.challenged) {
      await page.waitForTimeout(3500);
      await page.reload({waitUntil: 'networkidle2'});
      last = await tryOnce();
    }
    return last.html;
  } finally {
    await browser.close().catch(()=>{});
  }
}

app.get('/html', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('missing ?url=');
  try {
    const html = await fetchHTML(url);
    res.set('Content-Type', 'text/html; charset=utf-8').send(html);
  } catch (e) {
    res.status(502).send(`fetch error: ${e.message || e}`);
  }
});

app.get('/screenshot', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('missing ?url=');

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({width: 1366, height: 824});
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36'
    );
    await page.goto(url, {waitUntil: 'networkidle2', timeout: 45000});
    const buf = await page.screenshot({fullPage: true, type: 'png'});
    res.set('Content-Type', 'image/png').send(buf);
  } catch (e) {
    res.status(502).send(`screenshot error: ${e.message || e}`);
  } finally {
    await browser.close().catch(()=>{});
  }
});

app.listen(PORT, () => {
  console.log(`cf-proxy-mini listening on :${PORT}`);
  console.log(`proxy via ${PROXY}, chrome at ${CHROME}`);
});

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const CHROMIUM_PATH = '/usr/bin/chromium';
const USER_DATA_DIR = '/root/.cache/pptr-profile';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const url = 'https://bakamh.com/'; // 要测试的目标网址

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
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36'
  );

  await page.setExtraHTTPHeaders({
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'upgrade-insecure-requests': '1',
  });

  console.log(`[INFO] 访问目标：${url}`);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

  const title = await page.title();
  console.log(`[INFO] 页面标题：${title}`);

  // 额外等待 8 秒，让 CF 有时间验证
  await sleep(8000);

  const html = await page.content();
  console.log(`[INFO] 页面 HTML 长度: ${html.length}`);

  await browser.close();
})();

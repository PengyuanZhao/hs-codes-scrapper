const puppeteer = require('puppeteer');
const winston = require('winston');
const XLSX = require('xlsx');
const logger = require('./logger');

logger.add(new winston.transports.File({ filename: 'logs/hs-codes-scraper.log' }));

const workbook = XLSX.readFile('file.xlsx');
const startIndex = process.argv[2] || 2;

const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];

async function scraper() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080',
    ],
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['stylesheet', 'font', 'image'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  const url = `https://www.foreign-trade.com/reference/hscode.htm`;
  const results = [];

  const response = await page.goto(url, { timeout: 0 });

  if (response.status() !== 200 || response.request().redirectChain().length) {
    logger.warn(`Failed for some reason. Scraping again...`);
    return;
  }

  for (let i = startIndex; i < workbook.Strings.Count; i++) {
    const leafCategoryId = worksheet[`A${i}`].v;
    const leafCategoryName = worksheet[`B${i}`].v;
    const entry = [leafCategoryId, leafCategoryName];

    logger.info(`[Scraping ${i}] ${leafCategoryName}`);

    await page.type('input[name="searchcode"]', leafCategoryName);
    await page.click('input[name="action"]');

    try {
      await page.waitForNavigation();
    } catch (error) {
      logger.error(`[Scraping error] ${error}`);
      i--;
      continue;
    }

    await page.screenshot({ path: `./screenshots/1.png`, fullPage: true });
    const { keyword, codeNames } = await page.evaluate(() => {
      let keyword = '';
      const codeNames = Array.from(
        document.querySelectorAll('form[action="hscode.htm"] tr:not(:first-of-type)')
      ).map(result => {
        const $code = result.querySelector('td:first-of-type');
        const $name = result.querySelector('td:last-of-type');
        const $keyword = result.querySelector('span[style]');
        if (!keyword) keyword = $keyword ? $keyword.textContent.trim() : '';

        return [$code.textContent.trim(), $name.textContent.trim()];
      });
      return { keyword, codeNames };
    });

    entry.push(keyword);

    codeNames.forEach(([code, name]) => {
      entry.push(code);
      entry.push(name);
    });

    results.push(entry);
  }

  await browser.close();

  logger.info(`[Finished Scraping] Processed ${results.length} entries`);

  return results;
}

(async () => {
  try {
    const results = await scraper();
    // filename = `./results/百度新闻-${keyword}.csv`;
    // fs.writeFileSync(filename, csv);

    const workbook = XLSX.utils.book_new();
    const workbook = XLSX.readFile(filename, { type: 'array' });
    const worksheet = XLSX.utils.aoa_to_sheet(results);

    XLSX.utils.sheet_add_aoa(worksheet);

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    XLSX.writeFile(workbook, 'results.xlsx');
  } catch (err) {
    console.log('\x1b[31m%s\x1b[0m', err);
  }
})();

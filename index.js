const fs = require('fs');
const puppeteer = require('puppeteer');
const json2csv = require('json2csv').parse;
const winston = require('winston');
const logger = require('./logger');

logger.add(new winston.transports.File({ filename: 'logs/hs-codes-scraper.log' }));

async function scraper() {
  const browser = await puppeteer.launch({
    headless: false,
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
  const keyword = 'Toys & Hobbies:Vintage & Antique Toys:Other Vintage & Antique Toys';
  let results = [];

  logger.info(`[Scraping] ${url}`);

  const response = await page.goto(url, { timeout: 0 });

  if (response.status() !== 200 || response.request().redirectChain().length) {
    logger.warn(`Failed for some reason. Scraping again...`);
    return;
  }

  await page.type('input[name="searchcode"]', keyword);
  await page.click('input[name="action"]');
  await page.waitForNavigation();

  await page.screenshot({ path: `./screenshots/1.png`, fullPage: true });

  const newResults = await page.evaluate(() =>
    Array.from(document.querySelectorAll('form[action="hscode.htm"] tr:not(:first-of-type)')).map(
      result => {
        const $code = result.querySelector('td:first-of-type');
        const $name = result.querySelector('td:last-of-type');
        return {
          code: $code.textContent.trim(),
          name: $name.textContent.trim(),
        };
      }
    )
  );

  console.log(newResults);

  // logger.info(`[Page ${pageNum}] found ${newResults.length} results`);
  // console.log(' ');

  // results = results.concat(newResults);

  await browser.close();

  // logger.info(`[Finished scraping for ${keyword}] found ${results.length} results`);

  // const csv = json2csv(results, {
  //   fields: [
  //     { label: '日期', value: 'date' },
  //     { label: '时间', value: 'time' },
  //     { label: '来源', value: 'source' },
  //     { label: '标题', value: 'title' },
  //     { label: '链接', value: 'link' },
  //   ],
  //   withBOM: true,
  // });

  // return csv;
}

(async () => {
  try {
    csv = await scraper();
    // filename = `./results/百度新闻-${keyword}.csv`;
    // fs.writeFileSync(filename, csv);
  } catch (err) {
    console.log('\x1b[31m%s\x1b[0m', err);
  }
})();

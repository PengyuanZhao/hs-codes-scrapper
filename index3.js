const fs = require('fs');
const puppeteer = require('puppeteer');
const winston = require('winston');
const json2csv = require('json2csv');
const csvParse = require('csv-parse/lib/sync');
const logger = require('./logger');

logger.add(new winston.transports.File({ filename: 'logs/hs-codes-scraper.log' }));

const startIndex = process.argv[2] || 1;

const sourceFileName = 'file.csv';
const resultsFileName = 'results.csv';

logger.info(`[Parsing ${sourceFileName}`);

const data = csvParse(fs.readFileSync(sourceFileName, 'utf8'), {
  skip_empty_lines: true,
});

console.log(data);

logger.info(`[Found ${data.length} entries in ${sourceFileName}]`);

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

  const response = await page.goto(url, { timeout: 0 });

  if (response.status() !== 200 || response.request().redirectChain().length) {
    logger.warn(`Failed for some reason. Scraping again...`);
    return;
  }

  for (let i = startIndex; i < data.length; i++) {
    const categoryId = parseInt(data[i][0]);
    const categoryName = data[i][1];
    const entry = [categoryId, categoryName];

    logger.info(`[Scraping ${i}] ${categoryName}`);

    await page.type('input[name="searchcode"]', categoryName);
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

    const csv = json2csv.parse([entry], {
      fields: [...Object.keys(entry)],
      header: false,
      withBOM: true,
    });

    if (fs.existsSync(resultsFileName)) {
      fs.appendFile(resultsFileName, csv + '\r\n', function(err) {
        if (err) throw err;
        logger.info(`[New entry appended to ${resultsFileName}]`);
      });
    } else {
      fs.writeFile(resultsFileName, csv + '\r\n', function(err) {
        if (err) throw err;
        logger.info(`[New entry appended to ${resultsFileName}]`);
      });
    }
  }

  await browser.close();

  logger.info('[Finished Scraping]');
}

(async () => {
  try {
    await scraper();
  } catch (err) {
    console.log('\x1b[31m%s\x1b[0m', err);
  }
})();

import { chromium } from 'playwright';

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to pump.fun/go/bounties...');
  await page.goto('https://pump.fun/go/bounties', { waitUntil: 'domcontentloaded' });
  
  console.log('Waiting 5 seconds for JS to execute...');
  await page.waitForTimeout(5000);
  
  // Print page title
  console.log('Page Title:', await page.title());
  
  // Let's inspect elements on the page
  const html = await page.content();
  console.log('HTML Length:', html.length);
  
  // Try to find Next.js data
  const nextData = await page.evaluate(() => {
    const el = document.querySelector('#__NEXT_DATA__');
    return el ? el.textContent.slice(0, 1000) : 'Not found';
  });
  console.log('Next.js Data (first 1000 chars):', nextData);
  
  // Find all cards
  const cardsInfo = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('article, [class*="card"], [class*="Card"]'));
    return cards.map((c, i) => ({
      index: i,
      tagName: c.tagName,
      className: c.className,
      text: c.textContent.trim().slice(0, 200),
      outerHTML: c.outerHTML.slice(0, 500)
    })).slice(0, 5);
  });
  
  console.log('Found Cards:', JSON.stringify(cardsInfo, null, 2));
  
  await browser.close();
}

main().catch(console.error);

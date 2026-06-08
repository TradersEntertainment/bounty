import { chromium } from 'playwright';

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log('Navigating to pump.fun/go/bounties...');
  await page.goto('https://pump.fun/go/bounties', { waitUntil: 'domcontentloaded' });
  
  console.log('Waiting 5 seconds for JS to execute...');
  await page.waitForTimeout(5000);
  
  const articlesData = await page.evaluate(() => {
    const articles = Array.from(document.querySelectorAll('article'));
    return articles.map((art, idx) => {
      const keys = Object.keys(art);
      const reactPropKey = keys.find(k => k.startsWith('__reactProps') || k.startsWith('__reactFiber'));
      let reactProps = null;
      if (reactPropKey) {
        // Safe serialization of nested properties
        try {
          const props = art[reactPropKey];
          // Try to search properties recursively for any UUID
          const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
          let foundUuid = null;
          
          function searchObj(obj, depth = 0) {
            if (depth > 6 || !obj || typeof obj !== 'object') return;
            for (const key of Object.keys(obj)) {
              const val = obj[key];
              if (typeof val === 'string' && uuidRegex.test(val)) {
                foundUuid = val;
                return;
              }
              if (val && typeof val === 'object') {
                searchObj(val, depth + 1);
                if (foundUuid) return;
              }
            }
          }
          searchObj(props);
          reactProps = { foundUuid };
        } catch (e) {
          reactProps = { error: e.message };
        }
      }
      
      return {
        index: idx,
        text: art.textContent.slice(0, 50),
        reactProps
      };
    });
  });
  
  console.log('Articles React Props Data:', JSON.stringify(articlesData, null, 2));
  
  await browser.close();
}

main().catch(console.error);

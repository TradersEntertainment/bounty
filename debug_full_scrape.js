import { chromium } from 'playwright';
import { createHash } from 'crypto';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  const page = await context.newPage();
  
  console.log('Navigating to bounties page...');
  await page.goto('https://pump.fun/go/bounties', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  // ========== Strategy 1: Try __NEXT_DATA__ ==========
  console.log('\n========== STRATEGY 1: __NEXT_DATA__ ==========');
  const nextData = await page.evaluate(() => {
    const scriptTag = document.querySelector('#__NEXT_DATA__');
    if (!scriptTag) return null;
    try {
      const json = JSON.parse(scriptTag.textContent);
      const pageProps = json?.props?.pageProps;
      if (pageProps?.bounties) return { source: 'pageProps.bounties', data: pageProps.bounties.slice(0, 3) };
      if (pageProps?.data?.bounties) return { source: 'pageProps.data.bounties', data: pageProps.data.bounties.slice(0, 3) };
      // Search recursively
      function findBountyArrays(obj, path, depth = 0) {
        if (depth > 5 || !obj) return null;
        if (Array.isArray(obj) && obj.length > 0 && obj[0]?.title) return { source: path, data: obj.slice(0, 3) };
        if (typeof obj === 'object') {
          for (const key of Object.keys(obj)) {
            const result = findBountyArrays(obj[key], `${path}.${key}`, depth + 1);
            if (result) return result;
          }
        }
        return null;
      }
      return findBountyArrays(pageProps, 'pageProps');
    } catch (e) { return { error: e.message }; }
  });
  
  if (nextData) {
    console.log('FOUND Next.js data!');
    console.log('Source:', nextData.source);
    if (nextData.data) {
      for (const b of nextData.data) {
        console.log(`\n  Title: "${b.title}"`);
        console.log(`  reward: ${b.reward}, rewardAmount: ${b.rewardAmount}, reward_amount: ${b.reward_amount}`);
        console.log(`  rewardCurrency: ${b.rewardCurrency}, currency: ${b.currency}`);
        console.log(`  prize: ${b.prize}, amount: ${b.amount}`);
        console.log(`  id: ${b.id}`);
        // Show ALL keys that contain "reward" or "amount" or "price" or "usd"
        const interestingKeys = Object.keys(b).filter(k => 
          k.toLowerCase().includes('reward') || k.toLowerCase().includes('amount') || 
          k.toLowerCase().includes('price') || k.toLowerCase().includes('usd') ||
          k.toLowerCase().includes('token') || k.toLowerCase().includes('sol') ||
          k.toLowerCase().includes('value') || k.toLowerCase().includes('pool')
        );
        if (interestingKeys.length > 0) {
          console.log('  Interesting keys:', interestingKeys.map(k => `${k}=${JSON.stringify(b[k])}`).join(', '));
        }
      }
    }
  } else {
    console.log('No __NEXT_DATA__ found');
  }

  // ========== Strategy 2: API/Window data ==========
  console.log('\n========== STRATEGY 2: Window globals ==========');
  const windowData = await page.evaluate(() => {
    const results = {};
    if (window.__NEXT_DATA__) results.hasNextData = true;
    if (window.__DATA__) results.hasData = true;
    if (window.__INITIAL_DATA__) results.hasInitialData = true;
    if (window.__APOLLO_STATE__) results.hasApolloState = true;
    return results;
  });
  console.log('Window globals:', windowData);

  // ========== Strategy 3: DOM extraction (our actual logic) ==========
  console.log('\n========== STRATEGY 3: DOM extraction ==========');
  const domResults = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('article'));
    return cards.slice(0, 5).map((card, idx) => {
      const allText = card.textContent || '';
      const titleEl = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Title"], [class*="name"], [class*="Name"]');
      const title = titleEl?.textContent?.trim() || '';

      let rewardAmount = 0;
      let rewardCurrency = 'SOL';
      let rewardUsd = 0;

      const rewardEl = card.querySelector('.text-positive, [class*="positive"]');
      if (rewardEl) {
        const rewardText = rewardEl.textContent.trim();
        
        if (rewardText.startsWith('$')) {
          let cleaned = rewardText.replace('$', '').trim();
          if (cleaned.match(/^\d+[\.,]\d{3}$/)) {
            cleaned = cleaned.replace(/[\.,]/g, '');
          } else {
            cleaned = cleaned.replace(/,/g, '');
          }
          rewardUsd = parseFloat(cleaned) || 0;
        } else if (rewardText.toLowerCase().includes('sol')) {
          const match = rewardText.match(/([\d,.]+)\s*SOL/i);
          if (match) {
            rewardAmount = parseFloat(match[1].replace(/,/g, ''));
            rewardCurrency = 'SOL';
          }
        }

        const parent = rewardEl.parentElement;
        if (parent) {
          const spans = Array.from(parent.querySelectorAll('span'));
          const amountSpan = spans.find(s => s !== rewardEl && s.textContent.trim().length > 0 && !s.textContent.trim().startsWith('$'));
          if (amountSpan) {
            const amountText = amountSpan.textContent.trim();
            const match = amountText.match(/([\d,.]+)\s*([kKmM]?)\s*(\$?[a-zA-Z0-9_-]+)/);
            if (match) {
              let amt = parseFloat(match[1].replace(/,/g, ''));
              const unit = match[2].toLowerCase();
              if (unit === 'k') amt *= 1000;
              else if (unit === 'm') amt *= 1000000;
              rewardAmount = amt;
              rewardCurrency = match[3];
            }
          }
        }
      }

      // Extract link UUID
      let sourceUrl = '';
      const uuidRegex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
      const uuidMatch = card.outerHTML.match(uuidRegex);
      if (uuidMatch) sourceUrl = `https://pump.fun/go/${uuidMatch[1]}`;

      return {
        idx,
        title,
        rewardAmount,
        rewardCurrency,
        rewardUsd,
        sourceUrl,
      };
    });
  });

  console.log('\nDOM-extracted bounties:');
  for (const b of domResults) {
    console.log(`\n  [${b.idx}] "${b.title}"`);
    console.log(`      Amount: ${b.rewardAmount} ${b.rewardCurrency} | USD: $${b.rewardUsd}`);
    console.log(`      URL: ${b.sourceUrl}`);
  }

  // ========== Strategy 4: Check if normalizeBounty would override DOM results ==========
  console.log('\n========== CHECK WHICH STRATEGY WINS ==========');
  // The real scraper tries: nextData -> apiData -> DOM
  // If nextData returns data, DOM is NEVER used
  if (nextData && nextData.data && nextData.data.length > 0) {
    console.log('⚠️  __NEXT_DATA__ is available and would be used INSTEAD of DOM!');
    console.log('   DOM extraction would be SKIPPED.');
    console.log('   The reward values would come from normalizeBounty(nextData), not from DOM parsing.');
    
    // Simulate normalizeBounty on nextData
    console.log('\n   normalizeBounty output for first 3:');
    for (const raw of nextData.data) {
      const rewardAmount = parseFloat(raw.reward || raw.rewardAmount || raw.reward_amount || raw.prize || raw.amount || 0);
      const rewardCurrency = raw.rewardCurrency || raw.currency || 'SOL';
      console.log(`   Title: "${raw.title}" → rewardAmount=${rewardAmount}, currency=${rewardCurrency}`);
    }
  } else {
    console.log('✅ No __NEXT_DATA__, DOM extraction would be used.');
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(console.error);

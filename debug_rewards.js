import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://pump.fun/go/bounties', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Extract ALL reward data from every card, raw and unfiltered
  const cards = await page.evaluate(() => {
    const articles = Array.from(document.querySelectorAll('article'));
    return articles.map((card, idx) => {
      const titleEl = card.querySelector('h1, h2, h3, h4');
      const title = titleEl?.textContent?.trim() || '';

      // Find ALL elements with "positive" in class
      const positiveEls = Array.from(card.querySelectorAll('[class*="positive"]'));
      const positiveInfo = positiveEls.map(el => ({
        tagName: el.tagName,
        className: typeof el.className === 'string' ? el.className : '',
        text: el.textContent.trim(),
        htmlSnippet: el.outerHTML.slice(0, 120)
      }));

      // Get the FIRST positive element (what querySelector would return)
      const rewardEl = card.querySelector('.text-positive, [class*="positive"]');
      const rewardText = rewardEl?.textContent?.trim() || '';
      const rewardClassName = typeof rewardEl?.className === 'string' ? rewardEl.className : '';

      // Get parent and find sibling spans
      let siblingSpans = [];
      if (rewardEl) {
        const parent = rewardEl.parentElement;
        if (parent) {
          const spans = Array.from(parent.querySelectorAll('span'));
          siblingSpans = spans.map(s => ({
            text: s.textContent.trim(),
            className: typeof s.className === 'string' ? s.className : '',
            isSameAsRewardEl: s === rewardEl
          })).filter(s => s.text.length > 0);
        }
      }

      // Extract UUID from card
      let uuid = '';
      const uuidMatch = card.outerHTML.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (uuidMatch) uuid = uuidMatch[1];

      return {
        idx,
        title,
        uuid,
        rewardElText: rewardText,
        rewardElClass: rewardClassName,
        positiveElements: positiveInfo,
        siblingSpans
      };
    });
  });

  // Print first 8 cards with full detail
  for (const card of cards.slice(0, 8)) {
    console.log(`\n=== CARD ${card.idx}: "${card.title}" ===`);
    console.log(`UUID: ${card.uuid}`);
    console.log(`RewardEl text: "${card.rewardElText}" | class: "${card.rewardElClass.slice(0, 80)}"`);
    console.log(`All [class*=positive] elements (${card.positiveElements.length}):`);
    for (const pe of card.positiveElements) {
      console.log(`  - <${pe.tagName}> text="${pe.text}" class="${pe.className.slice(0, 60)}"`);
    }
    console.log(`Sibling spans in parent:`);
    for (const s of card.siblingSpans) {
      console.log(`  - text="${s.text}" same=${s.isSameAsRewardEl} class="${s.className.slice(0, 60)}"`);
    }
  }

  // Find the Jobcoin bounty specifically
  const jobcoin = cards.find(c => c.title.toLowerCase().includes('shave') || c.title.toLowerCase().includes('jobcoin') || c.uuid.includes('7b3c8ee4'));
  if (jobcoin) {
    console.log('\n\n========== JOBCOIN BOUNTY FOUND ==========');
    console.log(JSON.stringify(jobcoin, null, 2));
  } else {
    console.log('\n\nJobcoin bounty NOT found on current list page.');
  }

  await browser.close();
}

main().catch(console.error);

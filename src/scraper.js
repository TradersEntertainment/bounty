/**
 * Playwright scraper for Pump.fun GO bounties and submissions.
 *
 * Handles:
 * - Loading the SPA with JavaScript rendering
 * - Extracting bounty cards from /go/bounties
 * - Extracting submissions from /go/submissions
 * - Pagination (scroll-based or button-based)
 * - Resilient selectors with fallback strategies
 */

import { chromium } from 'playwright';
import { createLogger } from './logger.js';
import { createHash } from 'crypto';

const log = createLogger('scraper');

const DEFAULT_CONFIG = {
  headless: true,
  timeout: 30000,
  bountiesUrl: 'https://pump.fun/go/bounties',
  submissionsUrl: 'https://pump.fun/go/submissions',
  maxScrolls: 10,
  scrollDelay: 1500,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

/**
 * Create a browser instance with configured settings.
 */
async function createBrowser(config) {
  const headless = config.headless ?? (process.env.BROWSER_HEADLESS !== 'false');
  const timeout = config.timeout ?? parseInt(process.env.BROWSER_TIMEOUT || '30000', 10);

  log.info(`Launching browser (headless: ${headless}, timeout: ${timeout}ms)`);

  const browser = await chromium.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    userAgent: config.userAgent || DEFAULT_CONFIG.userAgent,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });

  context.setDefaultTimeout(timeout);

  return { browser, context };
}

/**
 * Scrape bounties from pump.fun/go/bounties.
 *
 * @param {Object} options - Scraper options
 * @returns {Array<Object>} Array of bounty objects
 */
export async function scrapeBounties(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  let browser, context;

  try {
    ({ browser, context } = await createBrowser(config));
    const page = await context.newPage();

    log.info(`Navigating to ${config.bountiesUrl}`);
    await page.goto(config.bountiesUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout });

    // Wait for the page content to render
    await waitForContent(page);

    // Try to load more bounties by scrolling
    await autoScroll(page, config.maxScrolls, config.scrollDelay);

    // Extract bounty data using multiple selector strategies
    const bounties = await extractBounties(page, config.bountiesUrl);

    log.info(`Scraped ${bounties.length} bounties`);
    return bounties;
  } catch (error) {
    log.error(`Scraping bounties failed: ${error.message}`);
    return [];
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Scrape submissions from pump.fun/go/submissions.
 *
 * @param {Object} options - Scraper options
 * @returns {Array<Object>} Array of submission objects
 */
export async function scrapeSubmissions(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  let browser, context;

  try {
    ({ browser, context } = await createBrowser(config));
    const page = await context.newPage();

    log.info(`Navigating to ${config.submissionsUrl}`);
    await page.goto(config.submissionsUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout });

    await waitForContent(page);
    await autoScroll(page, config.maxScrolls, config.scrollDelay);

    const submissions = await extractSubmissions(page, config.submissionsUrl);

    log.info(`Scraped ${submissions.length} submissions`);
    return submissions;
  } catch (error) {
    log.error(`Scraping submissions failed: ${error.message}`);
    return [];
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Scrape both bounties and submissions in a single browser session.
 */
export async function scrapeAll(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  let browser, context;

  try {
    ({ browser, context } = await createBrowser(config));

    // Scrape bounties
    const bountiesPage = await context.newPage();
    log.info(`Navigating to ${config.bountiesUrl}`);
    await bountiesPage.goto(config.bountiesUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout });
    await waitForContent(bountiesPage);
    await autoScroll(bountiesPage, config.maxScrolls, config.scrollDelay);
    const bounties = await extractBounties(bountiesPage, config.bountiesUrl);
    await bountiesPage.close();

    // Scrape submissions
    const submissionsPage = await context.newPage();
    log.info(`Navigating to ${config.submissionsUrl}`);
    await submissionsPage.goto(config.submissionsUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout });
    await waitForContent(submissionsPage);
    await autoScroll(submissionsPage, config.maxScrolls, config.scrollDelay);
    const submissions = await extractSubmissions(submissionsPage, config.submissionsUrl);
    await submissionsPage.close();

    log.info(`Scraped ${bounties.length} bounties and ${submissions.length} submissions`);
    return { bounties, submissions };
  } catch (error) {
    log.error(`Full scrape failed: ${error.message}`);
    return { bounties: [], submissions: [] };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

// ─── Content Extraction ──────────────────────────────────────────────

/**
 * Wait for the main content area to load.
 * Uses multiple strategies to detect when the SPA has finished rendering.
 */
async function waitForContent(page) {
  const selectors = [
    // Common card/list container selectors for Next.js SPAs
    '[data-testid="bounty-card"]',
    '[class*="bounty"]',
    '[class*="card"]',
    '[class*="Card"]',
    '[class*="listing"]',
    '[class*="grid"]',
    '[class*="list"]',
    'main',
    '#__next main',
    '[role="main"]',
  ];

  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      log.debug(`Content loaded with selector: ${selector}`);
      return;
    } catch {
      // Try next selector
    }
  }

  // Fallback: just wait for network idle
  log.debug('No specific selector matched, waiting for network idle...');
  await page.waitForTimeout(3000);
}

/**
 * Extract bounty data from the loaded page.
 * Uses multiple extraction strategies with fallback.
 */
async function extractBounties(page, baseUrl) {
  // Strategy 1: Try to intercept Next.js __NEXT_DATA__ or inline JSON
  const nextData = await extractNextData(page);
  if (nextData && nextData.length > 0) {
    log.info(`Extracted ${nextData.length} bounties from Next.js data`);
    return nextData.map(b => normalizeBounty(b, baseUrl));
  }

  // Strategy 2: Try to find bounty data in page scripts / fetch responses
  const apiData = await extractFromApiCalls(page);
  if (apiData && apiData.length > 0) {
    log.info(`Extracted ${apiData.length} bounties from API data`);
    return apiData.map(b => normalizeBounty(b, baseUrl));
  }

  // Strategy 3: DOM-based extraction with flexible selectors
  const domBounties = await extractFromDOM(page, baseUrl);
  if (domBounties.length > 0) {
    log.info(`Extracted ${domBounties.length} bounties from DOM`);
    return domBounties;
  }

  log.warn('No bounties extracted. Page structure may have changed.');
  return [];
}

/**
 * Try to extract data from Next.js __NEXT_DATA__ script tag.
 */
async function extractNextData(page) {
  try {
    const data = await page.evaluate(() => {
      const scriptTag = document.querySelector('#__NEXT_DATA__');
      if (!scriptTag) return null;

      const json = JSON.parse(scriptTag.textContent);
      const pageProps = json?.props?.pageProps;

      // Look for bounty data in various locations
      if (pageProps?.bounties) return pageProps.bounties;
      if (pageProps?.data?.bounties) return pageProps.data.bounties;
      if (pageProps?.initialData?.bounties) return pageProps.initialData.bounties;
      if (pageProps?.items) return pageProps.items;

      // Search recursively for arrays that look like bounty data
      function findBountyArrays(obj, depth = 0) {
        if (depth > 5 || !obj) return null;
        if (Array.isArray(obj) && obj.length > 0 && obj[0]?.title) return obj;

        if (typeof obj === 'object') {
          for (const key of Object.keys(obj)) {
            const result = findBountyArrays(obj[key], depth + 1);
            if (result) return result;
          }
        }
        return null;
      }

      return findBountyArrays(pageProps);
    });

    return data;
  } catch (error) {
    log.debug(`Next.js data extraction failed: ${error.message}`);
    return null;
  }
}

/**
 * Try to extract data from intercepted API/fetch calls.
 */
async function extractFromApiCalls(page) {
  try {
    const data = await page.evaluate(() => {
      // Look for data in window.__NEXT_DATA__ or similar globals
      const candidates = [
        window.__NEXT_DATA__?.props?.pageProps,
        window.__DATA__,
        window.__INITIAL_DATA__,
        window.__APOLLO_STATE__,
      ];

      for (const candidate of candidates) {
        if (!candidate) continue;
        if (Array.isArray(candidate) && candidate.length > 0) return candidate;

        // Search for arrays with bounty-like objects
        const values = Object.values(candidate);
        for (const val of values) {
          if (Array.isArray(val) && val.length > 0 && (val[0]?.title || val[0]?.name)) {
            return val;
          }
        }
      }

      return null;
    });

    return data;
  } catch (error) {
    log.debug(`API data extraction failed: ${error.message}`);
    return null;
  }
}

/**
 * Extract bounty data directly from DOM elements.
 * This is the most resilient but least structured approach.
 */
async function extractFromDOM(page, baseUrl) {
  try {
    const bounties = await page.evaluate((baseUrl) => {
      const results = [];

      // Strategy: find card-like containers
      const cardSelectors = [
        '[data-testid*="bounty"]',
        '[class*="bounty-card"], [class*="bountyCard"], [class*="BountyCard"]',
        '[class*="card"], [class*="Card"]',
        'article',
        '[role="listitem"]',
        // Generic: divs with specific structure inside a grid/list
        'main div > div > div',
      ];

      let cards = [];
      for (const selector of cardSelectors) {
        const found = document.querySelectorAll(selector);
        if (found.length >= 2) {
          cards = Array.from(found);
          break;
        }
      }

      // If we still have no cards, try to find repeating structures
      if (cards.length === 0) {
        // Look for the main content area and find repeated child patterns
        const main = document.querySelector('main') || document.querySelector('#__next');
        if (main) {
          // Find the deepest container with multiple similar children
          const containers = main.querySelectorAll('div');
          for (const container of containers) {
            const children = container.children;
            if (children.length >= 3) {
              // Check if children have similar structure (likely cards)
              const firstChildTags = Array.from(children[0]?.children || []).map(c => c.tagName).join(',');
              let similar = 0;
              for (const child of children) {
                const tags = Array.from(child.children || []).map(c => c.tagName).join(',');
                if (tags === firstChildTags && tags.length > 0) similar++;
              }
              if (similar >= 3) {
                cards = Array.from(children);
                break;
              }
            }
          }
        }
      }

      for (const card of cards) {
        const bounty = extractBountyFromCard(card, baseUrl);
        if (bounty && bounty.title) {
          results.push(bounty);
        }
      }

      return results;

      function extractBountyFromCard(card, baseUrl) {
        const allText = card.textContent || '';
        // Extract title: look for headings or prominent text
        const titleEl = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Title"], [class*="name"], [class*="Name"]');
        const title = titleEl?.textContent?.trim() || '';

        if (!title || title.length < 3) return null;

        // Extract description
        const descEl = card.querySelector('p, [class*="desc"], [class*="Desc"], [class*="body"], [class*="Body"], [class*="content"]');
        const description = descEl?.textContent?.trim() || '';

        // Extract reward amount, currency, and USD value
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
              } else {
                const parts = amountText.split(/\s+/);
                if (parts.length >= 2) {
                  const amt = parseFloat(parts[0].replace(/,/g, ''));
                  if (!isNaN(amt)) {
                    rewardAmount = amt;
                    rewardCurrency = parts[1];
                  }
                }
              }
            }
          }
        }

        // Extract creator/username
        const creatorEl = card.querySelector('[class*="creator"], [class*="Creator"], [class*="user"], [class*="User"], [class*="author"], [class*="Author"]');
        const creator = creatorEl?.textContent?.trim() || '';

        // Extract avatar
        const avatarEl = card.querySelector('img[class*="avatar"], img[class*="Avatar"], img[class*="profile"]');
        const creatorAvatar = avatarEl?.src || '';

        // Extract deadline
        const deadlineMatch = allText.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d+ (?:hour|day|minute|week)s?\s*(?:left|remaining))|(?:ends?\s+(?:in\s+)?(\d+\s*(?:h|d|m|hr|day|min)))/i);
        const deadline = deadlineMatch ? deadlineMatch[0] : '';

        // Extract status
        let status = 'active';
        const statusWords = allText.toLowerCase();
        if (statusWords.includes('completed') || statusWords.includes('claimed')) status = 'completed';
        else if (statusWords.includes('expired') || statusWords.includes('ended')) status = 'expired';
        else if (statusWords.includes('pending')) status = 'pending';

        // Extract submission count
        const submissionMatch = allText.match(/(\d+)\s*(?:submission|entry|entries|response|attempt)/i);
        const submissionCount = submissionMatch ? parseInt(submissionMatch[1], 10) : 0;

        // Extract image
        const imageEl = card.querySelector('button[aria-label*="image"] img, button[class*="aspect"] img, [class*="aspect-[4/3]"] img');
        const imageUrl = imageEl?.src || '';

        // Extract link: prefer finding the bounty UUID in React internal properties, then outerHTML, then fallbacks
        let sourceUrl = '';
        try {
          const keys = Object.keys(card);
          const reactKey = keys.find(k => k.startsWith('__reactProps') || k.startsWith('__reactFiber'));
          if (reactKey) {
            const props = card[reactKey];
            const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
            let foundUuid = '';
            
            function searchObj(obj, depth = 0) {
              if (depth > 6 || !obj || typeof obj !== 'object') return;
              for (const k of Object.keys(obj)) {
                const val = obj[k];
                if (typeof val === 'string') {
                  const m = val.match(uuidRegex);
                  if (m) {
                    foundUuid = m[0];
                    return;
                  }
                }
                if (val && typeof val === 'object') {
                  searchObj(val, depth + 1);
                  if (foundUuid) return;
                }
              }
            }
            
            searchObj(props);
            if (foundUuid) {
              sourceUrl = `https://pump.fun/go/${foundUuid}`;
            }
          }
        } catch (e) {
          // ignore React inspection error
        }

        if (!sourceUrl) {
          const uuidMatch = card.outerHTML.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
          if (uuidMatch) {
            sourceUrl = `https://pump.fun/go/${uuidMatch[1]}`;
          } else {
            const links = Array.from(card.querySelectorAll('a[href]'));
            if (links.length > 0) {
              const firstHref = links[0].getAttribute('href') || '';
              if (firstHref.includes('/go/')) {
                sourceUrl = new URL(firstHref, baseUrl).href;
              } else {
                sourceUrl = new URL(links[0].href, baseUrl).href;
              }
            }
          }
        }
        if (!sourceUrl) sourceUrl = baseUrl;

        return {
          title,
          description,
          rewardAmount,
          rewardCurrency,
          rewardUsd,
          creator,
          creatorAvatar,
          deadline,
          status,
          submissionCount,
          imageUrl,
          sourceUrl,
        };
      }
    }, baseUrl);

    // Generate IDs and deduplicate
    const seen = new Set();
    return bounties.filter(b => {
      const id = generateBountyId(b);
      b.id = id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  } catch (error) {
    log.error(`DOM extraction failed: ${error.message}`);
    return [];
  }
}

/**
 * Extract submissions from the submissions page.
 */
async function extractSubmissions(page, baseUrl) {
  try {
    const submissions = await page.evaluate((baseUrl) => {
      const results = [];

      // Find submission cards
      const cardSelectors = [
        '[data-testid*="submission"]',
        '[class*="submission"], [class*="Submission"]',
        '[class*="card"], [class*="Card"]',
        'article',
        '[role="listitem"]',
      ];

      let cards = [];
      for (const selector of cardSelectors) {
        const found = document.querySelectorAll(selector);
        if (found.length >= 1) {
          cards = Array.from(found);
          break;
        }
      }

      for (const card of cards) {
        // Extract submitter
        const userEl = card.querySelector('[class*="user"], [class*="User"], [class*="author"], [class*="submitter"]');
        const submitter = userEl?.textContent?.trim() || '';

        // Extract media
        const videoEl = card.querySelector('video, [class*="video"], [class*="Video"]');
        const imgEl = card.querySelector('img:not([class*="avatar"]):not([class*="icon"])');

        let mediaUrl = '';
        let mediaType = '';
        if (videoEl) {
          mediaUrl = videoEl.src || videoEl.querySelector('source')?.src || '';
          mediaType = 'video';
        } else if (imgEl) {
          mediaUrl = imgEl.src || '';
          mediaType = 'image';
        }

        // Extract description
        const descEl = card.querySelector('p, [class*="desc"], [class*="content"], [class*="text"]');
        const description = descEl?.textContent?.trim() || '';

        // Extract votes/likes
        const allText = card.textContent || '';
        const votesMatch = allText.match(/(\d+)\s*(?:vote|like|upvote|heart)/i);
        const votes = votesMatch ? parseInt(votesMatch[1], 10) : 0;

        // Extract status
        let status = 'pending';
        if (allText.toLowerCase().includes('approved') || allText.toLowerCase().includes('accepted')) {
          status = 'approved';
        } else if (allText.toLowerCase().includes('rejected') || allText.toLowerCase().includes('denied')) {
          status = 'rejected';
        } else if (allText.toLowerCase().includes('winner') || allText.toLowerCase().includes('won')) {
          status = 'winner';
        }

        // Extract bounty reference
        const bountyLink = card.querySelector('a[href*="bounty"], a[href*="go"]');
        const bountyRef = bountyLink?.href || '';

        // Extract link
        const linkEl = card.querySelector('a[href]');
        const sourceUrl = linkEl ? new URL(linkEl.href, baseUrl).href : baseUrl;

        if (submitter || description || mediaUrl) {
          results.push({
            submitter,
            mediaUrl,
            mediaType,
            description,
            status,
            votes,
            bountyRef,
            sourceUrl,
          });
        }
      }

      return results;
    }, baseUrl);

    // Generate IDs
    return submissions.map(s => ({
      ...s,
      id: generateSubmissionId(s),
      bountyId: s.bountyRef || '',
    }));
  } catch (error) {
    log.error(`Submission extraction failed: ${error.message}`);
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Normalize bounty data from various sources into a consistent format.
 */
function normalizeBounty(raw, baseUrl) {
  const id = raw.id || raw._id || '';
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let sourceUrl = raw.sourceUrl || raw.url || raw.link || '';

  if (id && uuidRegex.test(id)) {
    sourceUrl = `https://pump.fun/go/${id}`;
  } else {
    const match = sourceUrl.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (match) {
      sourceUrl = `https://pump.fun/go/${match[1]}`;
    }
  }
  if (!sourceUrl) sourceUrl = baseUrl;

  const bounty = {
    title: raw.title || raw.name || '',
    description: raw.description || raw.body || raw.content || '',
    rewardAmount: parseFloat(raw.reward || raw.rewardAmount || raw.reward_amount || raw.prize || raw.amount || 0),
    rewardCurrency: raw.rewardCurrency || raw.currency || 'SOL',
    creator: raw.creator || raw.author || raw.user || raw.username || '',
    creatorAvatar: raw.creatorAvatar || raw.avatar || raw.profileImage || '',
    deadline: raw.deadline || raw.endDate || raw.expiresAt || raw.expires_at || '',
    status: raw.status || 'active',
    submissionCount: parseInt(raw.submissionCount || raw.submission_count || raw.submissions || raw.entries || 0, 10),
    category: raw.category || raw.type || '',
    tags: raw.tags || [],
    imageUrl: raw.imageUrl || raw.image || raw.thumbnail || raw.media || '',
    sourceUrl,
    rawData: raw,
  };

  bounty.id = id || generateBountyId(bounty);
  return bounty;
}

/**
 * Generate a deterministic ID for a bounty based on its content.
 */
function generateBountyId(bounty) {
  const hash = createHash('sha256')
    .update(`${bounty.title}:${bounty.creator}:${bounty.rewardAmount}`)
    .digest('hex')
    .slice(0, 16);
  return `bounty_${hash}`;
}

/**
 * Generate a deterministic ID for a submission.
 */
function generateSubmissionId(submission) {
  const hash = createHash('sha256')
    .update(`${submission.submitter}:${submission.description}:${submission.mediaUrl}`)
    .digest('hex')
    .slice(0, 16);
  return `sub_${hash}`;
}

/**
 * Auto-scroll the page to load more content (infinite scroll).
 */
async function autoScroll(page, maxScrolls = 10, delay = 1500) {
  let previousHeight = 0;
  let scrollCount = 0;

  while (scrollCount < maxScrolls) {
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);

    if (currentHeight === previousHeight) {
      // Check for "Load More" button
      const loadMoreClicked = await clickLoadMore(page);
      if (!loadMoreClicked) {
        log.debug(`No more content to load after ${scrollCount} scrolls`);
        break;
      }
    }

    previousHeight = currentHeight;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(delay);
    scrollCount++;
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * Try to click a "Load More" / "Show More" button.
 */
async function clickLoadMore(page) {
  const loadMoreSelectors = [
    'button:has-text("Load More")',
    'button:has-text("Show More")',
    'button:has-text("load more")',
    'button:has-text("show more")',
    'button:has-text("View More")',
    '[class*="loadMore"]',
    '[class*="LoadMore"]',
    '[class*="load-more"]',
    '[class*="showMore"]',
    '[data-testid="load-more"]',
  ];

  for (const selector of loadMoreSelectors) {
    try {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        await page.waitForTimeout(2000);
        log.debug(`Clicked load more button: ${selector}`);
        return true;
      }
    } catch {
      // Try next selector
    }
  }

  return false;
}

/**
 * Check if a specific bounty has been completed (has a winner).
 * Navigates to the bounty detail page and looks for approved/winner submissions.
 *
 * @param {string} bountyUrl - The bounty detail URL (e.g., https://pump.fun/go/{uuid})
 * @param {Object} options - Scraper options
 * @returns {{ completed: boolean, winner: Object|null }}
 */
export async function checkBountyCompletion(bountyUrl, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  let browser, context;

  try {
    ({ browser, context } = await createBrowser(config));
    const page = await context.newPage();

    log.info(`🔍 Checking completion: ${bountyUrl}`);
    await page.goto(bountyUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout });

    // Wait for content to load
    await page.waitForTimeout(3000);

    // Dismiss any modals/popups
    const dismissButtons = [
      'button:has-text("Continue")',
      'button:has-text("Get started")',
      'button:has-text("Accept")',
      'button:has-text("Agree")',
    ];
    for (const selector of dismissButtons) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click();
          await page.waitForTimeout(1000);
        }
      } catch { /* ignore */ }
    }

    // Extract completion data from the bounty detail page
    const completionData = await page.evaluate(() => {
      const fullText = document.body.textContent || '';
      const fullTextLower = fullText.toLowerCase();

      // Check if bounty is completed/closed/ended
      const isCompleted = fullTextLower.includes('completed') ||
        fullTextLower.includes('winner') ||
        fullTextLower.includes('won') ||
        fullTextLower.includes('approved') ||
        fullTextLower.includes('claimed') ||
        fullTextLower.includes('ended') ||
        fullTextLower.includes('closed');

      if (!isCompleted) {
        return { completed: false, winner: null };
      }

      // Try to find the winner/approved submission
      // Look for submission cards with winner/approved status
      const allCards = document.querySelectorAll('[class*="card"], [class*="Card"], article, [role="listitem"], [class*="submission"], [class*="Submission"]');
      
      let winnerCard = null;
      for (const card of allCards) {
        const cardText = (card.textContent || '').toLowerCase();
        if (cardText.includes('winner') || cardText.includes('approved') || cardText.includes('accepted') || cardText.includes('won')) {
          winnerCard = card;
          break;
        }
      }

      let winner = null;
      if (winnerCard) {
        // Extract winner username
        const userEl = winnerCard.querySelector('[class*="user"], [class*="User"], [class*="author"], [class*="submitter"], [class*="name"], [class*="Name"]');
        const username = userEl?.textContent?.trim() || '';

        // Extract media (prefer video over image)
        const videoEl = winnerCard.querySelector('video, video source, [class*="video"], [class*="Video"]');
        const imgEl = winnerCard.querySelector('img:not([class*="avatar"]):not([class*="icon"]):not([class*="logo"])');

        let mediaUrl = '';
        let mediaType = '';
        if (videoEl) {
          mediaUrl = videoEl.src || videoEl.querySelector?.('source')?.src || '';
          mediaType = 'video';
        } else if (imgEl) {
          mediaUrl = imgEl.src || '';
          mediaType = 'image';
        }

        // Extract description
        const descEl = winnerCard.querySelector('p, [class*="desc"], [class*="content"], [class*="text"]');
        const description = descEl?.textContent?.trim() || '';

        winner = { username, mediaUrl, mediaType, description };
      }

      // If no specific winner card found, still look for any submission media on the page
      if (!winner) {
        // Look for any video/image that could be a submission
        const anyVideo = document.querySelector('video:not([class*="hero"]), video source');
        const anySubmissionImg = document.querySelector('[class*="submission"] img, [class*="Submission"] img');
        
        if (anyVideo) {
          winner = {
            username: '',
            mediaUrl: anyVideo.src || anyVideo.querySelector?.('source')?.src || '',
            mediaType: 'video',
            description: '',
          };
        } else if (anySubmissionImg) {
          winner = {
            username: '',
            mediaUrl: anySubmissionImg.src || '',
            mediaType: 'image',
            description: '',
          };
        }
      }

      return {
        completed: true,
        winner: winner && winner.mediaUrl ? winner : null,
      };
    });

    log.info(`📋 Completion check result for ${bountyUrl}: completed=${completionData.completed}, hasWinner=${!!completionData.winner}`);
    return completionData;

  } catch (error) {
    log.error(`Completion check failed for ${bountyUrl}: ${error.message}`);
    return { completed: false, winner: null };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Take a screenshot for debugging purposes.
 */
export async function debugScreenshot(page, name = 'debug') {
  try {
    const path = `./data/screenshots/${name}_${Date.now()}.png`;
    await page.screenshot({ path, fullPage: true });
    log.info(`Screenshot saved: ${path}`);
    return path;
  } catch (error) {
    log.error(`Screenshot failed: ${error.message}`);
    return null;
  }
}

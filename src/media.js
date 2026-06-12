/**
 * Media utilities for BountyFeedHQ.
 * Handles downloading bounty images or taking screenshots of bounty pages.
 */

import { chromium } from 'playwright';
import { createLogger } from './logger.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const log = createLogger('media');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MEDIA_DIR = process.env.MEDIA_DIR || join(__dirname, '..', 'data', 'media');

// Ensure media directory exists
if (!existsSync(MEDIA_DIR)) {
  mkdirSync(MEDIA_DIR, { recursive: true });
}

/**
 * Download an image from a URL and save to disk.
 * @param {string} url - Image URL
 * @param {string} filename - Output filename (without extension)
 * @returns {Promise<{path: string, buffer: Buffer, mimeType: string} | null>}
 */
function downloadImage(url, filename) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, { timeout: 15000 }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, filename).then(resolve);
      }

      if (res.statusCode !== 200) {
        log.warn(`Image download failed: HTTP ${res.statusCode} for ${url}`);
        resolve(null);
        return;
      }

      const contentType = res.headers['content-type'] || 'image/jpeg';
      const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
      const chunks = [];

      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (buffer.length < 1000) {
          log.warn(`Image too small (${buffer.length} bytes), skipping`);
          resolve(null);
          return;
        }
        const filePath = join(MEDIA_DIR, `${filename}${ext}`);
        writeFileSync(filePath, buffer);
        log.info(`Image downloaded: ${filePath} (${(buffer.length / 1024).toFixed(1)}KB)`);
        resolve({ path: filePath, buffer, mimeType: contentType });
      });
      res.on('error', () => resolve(null));
    });

    request.on('error', (err) => {
      log.warn(`Image download error: ${err.message}`);
      resolve(null);
    });

    request.on('timeout', () => {
      request.destroy();
      log.warn(`Image download timeout for ${url}`);
      resolve(null);
    });
  });
}

/**
 * Take a screenshot of a bounty page using Playwright.
 * @param {string} url - Bounty page URL
 * @param {string} filename - Output filename (without extension)
 * @returns {Promise<{path: string, buffer: Buffer, mimeType: string} | null>}
 */
async function screenshotBountyPage(url, filename) {
  let browser = null;

  try {
    log.info(`Taking screenshot of: ${url}`);

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Wait for content to render
    await page.waitForTimeout(3500);

    // Try to dismiss any modals/popups (Welcome, Terms, Cookies) if present
    try {
      await page.evaluate(() => {
        const keywords = ['continue', 'get started', 'accept all', 'agree', 'accept'];
        const buttons = Array.from(document.querySelectorAll('button'));
        
        for (const kw of keywords) {
          const btn = buttons.find(b => {
            const txt = b.textContent.trim().toLowerCase();
            return txt === kw || txt.includes(kw);
          });
          if (btn) {
            btn.click();
          }
        }
      });
      // Wait a moment for any modals to fade out
      await page.waitForTimeout(1500);
    } catch (err) {
      log.warn(`Failed to dismiss modals: ${err.message}`);
    }

    // Validate that the page actually loaded bounty content
    // If it's just a welcome screen or error page, skip the screenshot
    const hasContent = await page.evaluate(() => {
      const bodyText = document.body?.textContent || '';
      // Check for bounty-specific content indicators
      const hasBountyContent = bodyText.includes('bounty') || bodyText.includes('Bounty') ||
        bodyText.includes('reward') || bodyText.includes('Reward') ||
        bodyText.includes('submission') || bodyText.includes('Submission') ||
        bodyText.includes('SOL') || bodyText.includes('deadline');
      // Check for error/splash indicators
      const isSplash = bodyText.includes('Welcome to Pump') && bodyText.length < 500;
      const isError = bodyText.includes('404') || bodyText.includes('not found') || bodyText.includes('Page not found');
      
      return hasBountyContent && !isSplash && !isError;
    });

    if (!hasContent) {
      log.warn(`Page at ${url} doesn't appear to contain bounty content, skipping screenshot`);
      await browser.close();
      return null;
    }

    // Try to find the main bounty card/content area for a focused screenshot
    const selectors = [
      '[class*="bounty"]',
      '[class*="card"]',
      '[class*="task"]',
      'main',
      'article',
      '.container',
    ];

    let element = null;
    for (const sel of selectors) {
      try {
        element = await page.$(sel);
        if (element) {
          const box = await element.boundingBox();
          if (box && box.width > 200 && box.height > 100) {
            break;
          }
          element = null;
        }
      } catch {
        element = null;
      }
    }

    const filePath = join(MEDIA_DIR, `${filename}.png`);
    let buffer;

    if (element) {
      // Screenshot just the bounty card
      buffer = await element.screenshot({ type: 'png' });
    } else {
      // Full page screenshot with crop
      buffer = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1280, height: 800 },
      });
    }

    writeFileSync(filePath, buffer);
    log.info(`Screenshot saved: ${filePath} (${(buffer.length / 1024).toFixed(1)}KB)`);

    await browser.close();
    return { path: filePath, buffer, mimeType: 'image/png' };
  } catch (error) {
    log.error(`Screenshot failed: ${error.message}`);
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return null;
  }
}

/**
 * Generate a fun AI image for a bounty using Pollinations.ai (free, no API key).
 * Creates a funny, vibrant illustration related to the bounty task.
 *
 * @param {string} bountyTitle - Title of the bounty
 * @param {string} bountyId - ID for filename
 * @returns {Promise<{path: string, buffer: Buffer, mimeType: string} | null>}
 */
async function generateAIImage(bountyTitle, bountyId) {
  try {
    // Create a creative prompt based on the bounty title
    const cleanTitle = (bountyTitle || 'crypto bounty task')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .slice(0, 100);

    const artStyles = [
      'funny cartoon illustration, vibrant colors, meme style, exaggerated expressions',
      'comedic digital art, bright neon colors, pop art style, humorous',
      'funny 3D render, colorful, playful, exaggerated proportions, comedic scene',
      'hilarious editorial illustration, bold colors, dynamic composition, satirical',
      'meme-worthy digital painting, vibrant, over-the-top, comedic',
    ];
    const style = artStyles[Math.floor(Math.random() * artStyles.length)];

    const prompt = `${cleanTitle}, ${style}, no text overlay, no watermark`;
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=576&seed=${Date.now()}&nologo=true`;

    log.info(`🎨 Generating AI image for: "${cleanTitle.slice(0, 50)}..."`);

    return new Promise((resolve) => {
      const request = https.get(url, { timeout: 30000 }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          https.get(res.headers.location, { timeout: 30000 }, (redirectRes) => {
            handleImageResponse(redirectRes, bountyId, resolve);
          }).on('error', () => resolve(null)).on('timeout', function() { this.destroy(); resolve(null); });
          return;
        }

        handleImageResponse(res, bountyId, resolve);
      });

      request.on('error', (err) => {
        log.warn(`AI image generation error: ${err.message}`);
        resolve(null);
      });

      request.on('timeout', () => {
        request.destroy();
        log.warn('AI image generation timeout');
        resolve(null);
      });
    });
  } catch (err) {
    log.warn(`AI image generation failed: ${err.message}`);
    return null;
  }
}

function handleImageResponse(res, bountyId, resolve) {
  if (res.statusCode !== 200) {
    log.warn(`AI image generation HTTP ${res.statusCode}`);
    resolve(null);
    return;
  }

  const contentType = res.headers['content-type'] || 'image/jpeg';
  const ext = contentType.includes('png') ? '.png' : '.jpg';
  const chunks = [];

  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => {
    const buffer = Buffer.concat(chunks);
    if (buffer.length < 5000) {
      log.warn(`AI image too small (${buffer.length} bytes), skipping`);
      resolve(null);
      return;
    }
    const filePath = join(MEDIA_DIR, `ai_${bountyId}${ext}`);
    writeFileSync(filePath, buffer);
    log.info(`✅ AI image generated: ${filePath} (${(buffer.length / 1024).toFixed(1)}KB)`);
    resolve({ path: filePath, buffer, mimeType: contentType });
  });
  res.on('error', () => resolve(null));
}

/**
 * Get media for a bounty: download image if available, generate AI image, or screenshot.
 * @param {Object} draft - Draft tweet object with image_url, source_url, and bounty_title fields
 * @returns {Promise<{path: string, buffer: Buffer, mimeType: string} | null>}
 */
export async function getBountyMedia(draft) {
  const bountyId = (draft.bounty_id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  
  // Check if we already have a cached image (including AI-generated)
  const cachedPatterns = ['', 'ai_'];
  for (const prefix of cachedPatterns) {
    const cachedFiles = ['jpg', 'png', 'webp'].map(ext => join(MEDIA_DIR, `${prefix}${bountyId}.${ext}`));
    for (const cached of cachedFiles) {
      if (existsSync(cached)) {
        log.info(`Using cached media: ${cached}`);
        const buffer = readFileSync(cached);
        const mimeType = cached.endsWith('.png') ? 'image/png' : cached.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        return { path: cached, buffer, mimeType };
      }
    }
  }

  // Strategy 1: Download the bounty's image if available
  if (draft.image_url && draft.image_url.length > 10) {
    log.info(`Downloading bounty image: ${draft.image_url}`);
    const result = await downloadImage(draft.image_url, bountyId);
    if (result) return result;
  }

  // Strategy 2: Generate a funny AI image based on the bounty title
  const bountyTitle = draft.bounty_title || draft.title || '';
  if (bountyTitle.length > 3) {
    log.info('🎨 No bounty image — generating AI image...');
    const aiResult = await generateAIImage(bountyTitle, bountyId);
    if (aiResult) return aiResult;
  }

  // Strategy 3: Take a screenshot of the bounty page (last resort)
  if (draft.source_url && draft.source_url.length > 10) {
    log.info('📸 AI image failed — falling back to page screenshot...');
    const result = await screenshotBountyPage(draft.source_url, bountyId);
    if (result) return result;
  }

  log.warn(`No media available for bounty ${bountyId}`);
  return null;
}

/**
 * Download media from a submission (winner's video or image).
 * Used for success story / completion tweets.
 *
 * @param {string} mediaUrl - URL of the media to download
 * @param {string} mediaType - 'video' or 'image'
 * @param {string} bountyId - Bounty ID for filename
 * @returns {Promise<{path: string, buffer: Buffer, mimeType: string} | null>}
 */
export async function downloadSubmissionMedia(mediaUrl, mediaType, bountyId) {
  if (!mediaUrl || mediaUrl.length < 10) {
    log.warn('No submission media URL provided');
    return null;
  }

  const safeId = (bountyId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `completion_${safeId}`;

  log.info(`📥 Downloading submission ${mediaType}: ${mediaUrl}`);

  return new Promise((resolve) => {
    const protocol = mediaUrl.startsWith('https') ? https : http;

    const request = protocol.get(mediaUrl, { timeout: 30000 }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadSubmissionMedia(res.headers.location, mediaType, bountyId).then(resolve);
      }

      if (res.statusCode !== 200) {
        log.warn(`Submission media download failed: HTTP ${res.statusCode}`);
        resolve(null);
        return;
      }

      const contentType = res.headers['content-type'] || '';
      let ext = '.jpg';
      let mimeType = 'image/jpeg';

      if (mediaType === 'video' || contentType.includes('video')) {
        ext = contentType.includes('webm') ? '.webm' : '.mp4';
        mimeType = contentType.includes('webm') ? 'video/webm' : 'video/mp4';
      } else {
        if (contentType.includes('png')) { ext = '.png'; mimeType = 'image/png'; }
        else if (contentType.includes('webp')) { ext = '.webp'; mimeType = 'image/webp'; }
        else if (contentType.includes('gif')) { ext = '.gif'; mimeType = 'image/gif'; }
        else { ext = '.jpg'; mimeType = 'image/jpeg'; }
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);

        // Skip if too small (likely an error page)
        if (buffer.length < 1000) {
          log.warn(`Submission media too small (${buffer.length} bytes), skipping`);
          resolve(null);
          return;
        }

        // Skip if video is too large for Twitter (> 15MB for now)
        if (mediaType === 'video' && buffer.length > 15 * 1024 * 1024) {
          log.warn(`Video too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB), skipping upload`);
          resolve(null);
          return;
        }

        const filePath = join(MEDIA_DIR, `${filename}${ext}`);
        writeFileSync(filePath, buffer);
        log.info(`✅ Submission media downloaded: ${filePath} (${(buffer.length / 1024).toFixed(1)}KB)`);
        resolve({ path: filePath, buffer, mimeType });
      });
      res.on('error', () => resolve(null));
    });

    request.on('error', (err) => {
      log.warn(`Submission media download error: ${err.message}`);
      resolve(null);
    });

    request.on('timeout', () => {
      request.destroy();
      log.warn(`Submission media download timeout for ${mediaUrl}`);
      resolve(null);
    });
  });
}

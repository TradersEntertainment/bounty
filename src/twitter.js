/**
 * Twitter/X API v2 integration for BountyFeedHQ.
 * Handles posting tweets, threads, and media uploads.
 */

import { TwitterApi } from 'twitter-api-v2';
import { createLogger } from './logger.js';

const log = createLogger('twitter');

let client = null;
let readWriteClient = null;

// Cache for verifyCredentials to avoid repeated v2.me() calls ($$$)
let credentialCache = null;
let credentialCacheExpiry = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Initialize the Twitter API client with credentials from environment.
 */
export function initTwitterClient() {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    log.warn('Twitter API credentials not fully configured. Posting will be disabled.');
    return null;
  }

  client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });

  readWriteClient = client.readWrite;
  log.info('Twitter client initialized successfully');
  return readWriteClient;
}

/**
 * Get the initialized Twitter client.
 */
export function getTwitterClient() {
  if (!readWriteClient) {
    return initTwitterClient();
  }
  return readWriteClient;
}

/**
 * Post a single tweet.
 *
 * @param {string} text - Tweet text (max 280 chars)
 * @param {Object} options - Additional options
 * @param {string} options.replyToId - Tweet ID to reply to (for threads)
 * @param {string} options.mediaId - Media ID to attach
 * @returns {{ success: boolean, tweetId: string, error: string }}
 */
export async function postTweet(text, options = {}) {
  const twitterClient = getTwitterClient();

  if (!twitterClient) {
    return {
      success: false,
      tweetId: null,
      error: 'Twitter client not initialized. Check API credentials.',
    };
  }

  try {
    const tweetPayload = { text };

    // Add reply reference if this is part of a thread
    if (options.replyToId) {
      tweetPayload.reply = { in_reply_to_tweet_id: options.replyToId };
    }

    // Add media if provided
    if (options.mediaId) {
      tweetPayload.media = { media_ids: [options.mediaId] };
    }

    // Add quote tweet reference if provided (for success story posts)
    if (options.quoteTweetId) {
      tweetPayload.quote_tweet_id = options.quoteTweetId;
    }

    const result = await twitterClient.v2.tweet(tweetPayload);

    log.info(`Tweet posted successfully: ${result.data.id}`);
    return {
      success: true,
      tweetId: result.data.id,
      error: null,
    };
  } catch (error) {
    const errorMsg = formatTwitterError(error);
    log.error(`Failed to post tweet: ${errorMsg}`);
    return {
      success: false,
      tweetId: null,
      error: errorMsg,
    };
  }
}

/**
 * Post a thread (array of tweet texts).
 *
 * @param {string[]} tweets - Array of tweet texts
 * @returns {{ success: boolean, tweetIds: string[], error: string }}
 */
export async function postThread(tweets) {
  const twitterClient = getTwitterClient();

  if (!twitterClient) {
    return {
      success: false,
      tweetIds: [],
      error: 'Twitter client not initialized. Check API credentials.',
    };
  }

  const tweetIds = [];

  try {
    let previousTweetId = null;

    for (let i = 0; i < tweets.length; i++) {
      const tweetText = tweets[i];
      const options = previousTweetId ? { replyToId: previousTweetId } : {};

      const result = await postTweet(tweetText, options);

      if (!result.success) {
        log.error(`Thread broken at tweet ${i + 1}/${tweets.length}: ${result.error}`);
        return {
          success: false,
          tweetIds,
          error: `Thread failed at tweet ${i + 1}: ${result.error}`,
        };
      }

      tweetIds.push(result.tweetId);
      previousTweetId = result.tweetId;

      // Small delay between thread tweets to avoid rate limits
      if (i < tweets.length - 1) {
        await sleep(1000);
      }
    }

    log.info(`Thread posted successfully: ${tweetIds.length} tweets`);
    return {
      success: true,
      tweetIds,
      error: null,
    };
  } catch (error) {
    const errorMsg = formatTwitterError(error);
    log.error(`Thread posting failed: ${errorMsg}`);
    return {
      success: false,
      tweetIds,
      error: errorMsg,
    };
  }
}

/**
 * Upload media (image/video) to Twitter.
 * Note: Media upload uses v1.1 API endpoint.
 *
 * @param {string|Buffer} media - File path or buffer
 * @param {string} mimeType - MIME type (e.g., 'image/jpeg', 'video/mp4')
 * @returns {{ success: boolean, mediaId: string, error: string }}
 */
export async function uploadMedia(media, mimeType = 'image/jpeg') {
  const twitterClient = getTwitterClient();

  if (!twitterClient) {
    return {
      success: false,
      mediaId: null,
      error: 'Twitter client not initialized.',
    };
  }

  try {
    const mediaId = await twitterClient.v1.uploadMedia(media, { mimeType });

    log.info(`Media uploaded successfully: ${mediaId}`);
    return {
      success: true,
      mediaId,
      error: null,
    };
  } catch (error) {
    const errorMsg = formatTwitterError(error);
    log.error(`Media upload failed: ${errorMsg}`);
    return {
      success: false,
      mediaId: null,
      error: errorMsg,
    };
  }
}

/**
 * Verify that the Twitter credentials are valid.
 * Results are cached for 1 hour to minimize API calls.
 *
 * @param {boolean} forceRefresh - Force a fresh API call ignoring cache
 * @returns {{ valid: boolean, username: string, error: string }}
 */
export async function verifyCredentials(forceRefresh = false) {
  // Return cached result if still valid
  if (!forceRefresh && credentialCache && Date.now() < credentialCacheExpiry) {
    log.debug(`Using cached credentials (@${credentialCache.username})`);
    return credentialCache;
  }

  const twitterClient = getTwitterClient();

  if (!twitterClient) {
    return {
      valid: false,
      username: null,
      error: 'Twitter client not initialized.',
    };
  }

  try {
    const me = await twitterClient.v2.me();
    log.info(`Verified as @${me.data.username}`);
    const result = {
      valid: true,
      username: me.data.username,
      error: null,
    };
    // Cache the successful result
    credentialCache = result;
    credentialCacheExpiry = Date.now() + CACHE_TTL_MS;
    return result;
  } catch (error) {
    const errorMsg = formatTwitterError(error);
    log.error(`Credential verification failed: ${errorMsg}`);
    // Clear cache on failure
    credentialCache = null;
    credentialCacheExpiry = 0;
    return {
      valid: false,
      username: null,
      error: errorMsg,
    };
  }
}

/**
 * Check rate limit status.
 */
export async function checkRateLimit() {
  // Use cached credentials instead of making a fresh API call
  const cached = await verifyCredentials();
  if (!cached || !cached.valid) {
    return {
      ok: false,
      error: cached?.error || 'Twitter client not initialized.',
    };
  }
  return {
    ok: true,
    user: cached.username,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Format Twitter API errors into readable messages.
 */
function formatTwitterError(error) {
  if (error.code === 403) {
    return 'Forbidden: Check your app permissions (need Read+Write access).';
  }
  if (error.code === 401) {
    return 'Unauthorized: Check your API credentials.';
  }
  if (error.code === 429) {
    const resetAt = error.rateLimit?.reset
      ? new Date(error.rateLimit.reset * 1000).toISOString()
      : 'unknown';
    return `Rate limited. Resets at: ${resetAt}`;
  }
  if (error.data?.detail) {
    return error.data.detail;
  }
  if (error.message) {
    return error.message;
  }
  return String(error);
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

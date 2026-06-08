/**
 * Twitter/X API v2 integration for BountyFeedHQ.
 * Handles posting tweets, threads, and media uploads.
 */

import { TwitterApi } from 'twitter-api-v2';
import { createLogger } from './logger.js';

const log = createLogger('twitter');

let client = null;
let readWriteClient = null;

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
 *
 * @returns {{ valid: boolean, username: string, error: string }}
 */
export async function verifyCredentials() {
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
    return {
      valid: true,
      username: me.data.username,
      error: null,
    };
  } catch (error) {
    const errorMsg = formatTwitterError(error);
    log.error(`Credential verification failed: ${errorMsg}`);
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
  const twitterClient = getTwitterClient();
  if (!twitterClient) return null;

  try {
    // Twitter API v2 doesn't have a direct rate limit endpoint
    // We'll check by making a lightweight call
    const me = await twitterClient.v2.me();
    return {
      ok: true,
      user: me.data.username,
    };
  } catch (error) {
    if (error.code === 429) {
      const resetAt = error.rateLimit?.reset
        ? new Date(error.rateLimit.reset * 1000).toISOString()
        : 'unknown';
      return {
        ok: false,
        rateLimited: true,
        resetAt,
      };
    }
    return {
      ok: false,
      error: formatTwitterError(error),
    };
  }
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

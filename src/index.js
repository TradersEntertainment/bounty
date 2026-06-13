/**
 * BountyFeedHQ — Main CLI Orchestrator
 *
 * Commands:
 *   scan        Scrape pump.fun/go for new bounties
 *   score       Score all unscored bounties
 *   draft       Generate tweet drafts for high-scoring bounties
 *   post        Post the next draft tweet
 *   recap       Generate and post a daily recap
 *   auto        Run the full pipeline (scan → score → draft → post)
 *   cron        Start the scheduled auto-runner
 *   status      Show database stats and pending drafts
 *   verify      Verify Twitter API credentials
 *
 * Flags:
 *   --dry-run   Don't post to Twitter, just simulate
 *   --auto      Auto-post tweets without manual approval
 *   --limit N   Limit number of items to process
 *   --verbose   Enable debug logging
 */

import { config as loadEnv } from 'dotenv';
import cron from 'node-cron';
import { createLogger } from './logger.js';
import {
  initDatabase, getDb, closeDatabase,
  upsertBounty, upsertSubmission, upsertScore, getBounty,
  getUnscoredBounties, getUndraftedBounties, getDraftTweets,
  getActiveBounties, getRecentBounties, getTopScoredBounties,
  saveTweetDraft, markTweetPosted, markTweetFailed,
  getTodayTweetCount, bountyHasTweet, updateDailyStats, getTodayStats,
  insertCompletion, getPostedBountiesForCompletionCheck,
  getUnpostedCompletions, markCompletionPosted,
} from './database.js';
import { scrapeBounties, scrapeSubmissions, scrapeAll, checkBountyCompletion, scrapeBountyDetails } from './scraper.js';
import { scoreBounty, categorizeBounty, formatScoreSummary } from './scorer.js';
import { generateTweet, generateRecapTweet, generateThread, generateSuccessStoryTweet } from './templates.js';
import { filterBounty, filterTweet, getFilterStats } from './filter.js';
import { postTweet, postThread, verifyCredentials, initTwitterClient, uploadMedia } from './twitter.js';
import { sendTelegramMessage, sendTelegramPhoto } from './telegram.js';
import { getBountyMedia, downloadSubmissionMedia } from './media.js';
import { startServer } from './server.js';
import { generateTweetWithLLM } from './llm.js';

// Load .env
loadEnv();

const log = createLogger('main');

// ─── CLI Argument Parsing ────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-n'),
    auto: args.includes('--auto') || args.includes('-a'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    help: args.includes('--help') || args.includes('-h'),
  };

  // Parse --limit N
  const limitIdx = args.indexOf('--limit');
  flags.limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) || 10 : 10;

  // Set log level for verbose
  if (flags.verbose) {
    process.env.LOG_LEVEL = 'debug';
  }

  return { command, flags };
}

// ─── Commands ────────────────────────────────────────────────────────

/**
 * SCAN: Scrape pump.fun/go for new bounties and submissions.
 */
async function cmdScan(flags) {
  log.info('🔍 Starting scan...');

  const { bounties, submissions } = await scrapeAll();

  // Fetch SOL price to calculate USD values
  let solPrice = 150; // default fallback
  try {
    const res = await fetch('https://api.coinbase.com/v2/prices/SOL-USD/spot');
    const data = await res.json();
    const price = parseFloat(data?.data?.amount);
    if (!isNaN(price) && price > 0) {
      solPrice = price;
      log.info(`Fetched current SOL price from Coinbase: $${solPrice}`);
    }
  } catch (err) {
    log.warn(`Failed to fetch SOL price, using fallback $${solPrice}: ${err.message}`);
  }

  // Enrich details (description & deliverables) for new or description-less bounties
  const bountiesToEnrich = [];
  for (const bounty of bounties) {
    const existing = getBounty(bounty.id);
    if (!existing || !existing.description || existing.description.trim() === '') {
      bountiesToEnrich.push(bounty);
    }
  }

  if (bountiesToEnrich.length > 0) {
    log.info(`ℹ️ Found ${bountiesToEnrich.length} new or description-less bounties. Scraping detail pages...`);
    const urls = bountiesToEnrich.map(b => b.sourceUrl).filter(Boolean);
    const enrichedData = await scrapeBountyDetails(urls);
    
    for (const bounty of bountiesToEnrich) {
      const details = enrichedData[bounty.sourceUrl];
      if (details) {
        let fullDesc = details.description || '';
        if (details.deliverables) {
          fullDesc = fullDesc ? `${fullDesc}\n\nDeliverables:\n${details.deliverables}` : details.deliverables;
        }
        bounty.description = fullDesc.trim();
      }
    }
  }

  let newCount = 0;
  let filteredCount = 0;

  for (const bounty of bounties) {
    // Run content safety filter
    const filterResult = filterBounty(bounty);
    if (!filterResult.safe) {
      log.warn(`⛔ Filtered bounty "${bounty.title}": ${filterResult.reason}`);
      filteredCount++;
      continue;
    }

    // Assign calculated USD amount only for SOL rewards (token rewards already have parsed rewardUsd)
    if (bounty.rewardCurrency === 'SOL') {
      bounty.rewardUsd = (bounty.rewardAmount || 0) * solPrice;
    }

    upsertBounty(bounty);
    newCount++;
  }

  for (const submission of submissions) {
    upsertSubmission(submission);
  }

  // Update daily stats
  const maxReward = bounties.reduce((max, b) => Math.max(max, b.rewardAmount || 0), 0);
  updateDailyStats({ bountiesScraped: newCount, highestReward: maxReward });

  log.info(`✅ Scan complete: ${newCount} bounties saved, ${filteredCount} filtered, ${submissions.length} submissions`);
  return { newCount, filteredCount, submissions: submissions.length };
}

/**
 * SCORE: Calculate viral scores for all unscored bounties.
 */
async function cmdScore(flags) {
  log.info('📊 Scoring unscored bounties...');

  const unscored = getUnscoredBounties();
  log.info(`Found ${unscored.length} unscored bounties`);

  let scored = 0;
  const limit = flags.limit || 30; // Limit to prevent long wait times and rate limit issues
  const chunk = unscored.slice(0, limit);
  log.info(`Scoring next chunk of ${chunk.length} bounties...`);

  for (const bounty of chunk) {
    const scores = await scoreBounty(bounty);
    upsertScore(bounty.id, scores);

    if (flags.verbose) {
      console.log(`\n─── ${bounty.title} ───`);
      console.log(formatScoreSummary(scores));
    }

    scored++;
  }

  // Update avg viral score in daily stats
  const topBounties = getTopScoredBounties(100);
  if (topBounties.length > 0) {
    const avgScore = topBounties.reduce((sum, b) => sum + b.viral_score, 0) / topBounties.length;
    updateDailyStats({ avgViralScore: Math.round(avgScore) });
  }

  log.info(`✅ Scored ${scored} bounties`);
  return { scored };
}

/**
 * DRAFT: Generate tweet drafts for high-scoring, undrafted bounties.
 */
async function cmdDraft(flags) {
  const minScore = parseInt(process.env.MIN_VIRAL_SCORE || '40', 10);
  log.info(`📝 Drafting tweets (min score: ${minScore})...`);

  const candidates = getUndraftedBounties(minScore);
  log.info(`Found ${candidates.length} eligible bounties`);

  let drafted = 0;
  const limit = flags.limit || 10;

  for (const bounty of candidates.slice(0, limit)) {
    // Determine category
    const scores = {
      viralScore: bounty.viral_score,
      absurdityScore: bounty.absurdity_score,
      rewardScore: bounty.reward_score,
      doabilityScore: bounty.doability_score,
      visualScore: bounty.visual_score,
      timingScore: bounty.timing_score,
    };
    const category = categorizeBounty(bounty, scores);

    // Generate tweet
    let text = '';
    let templateUsed = 'template';
    let isThread = scores.viralScore >= 80;
    let finalTweetText = '';

    if (process.env.GROQ_API_KEY) {
      log.info(`🤖 Generating custom tweet with Groq for: "${bounty.title}"`);
      const llmTweet = await generateTweetWithLLM(bounty, scores);
      if (llmTweet) {
        finalTweetText = llmTweet.text;
        isThread = llmTweet.type === 'thread';
        templateUsed = 'groq_llm';
      }
    }

    if (!finalTweetText) {
      // Fallback to template-based generation
      const result = generateTweet(bounty, category);
      text = result.text;
      templateUsed = result.templateUsed;
      
      if (isThread) {
        const thread = generateThread(bounty, scores);
        finalTweetText = thread.join('\n---THREAD_SEPARATOR---\n');
      } else {
        finalTweetText = text;
      }
    }

    // Safety check on generated tweet
    const firstTweetPart = isThread ? finalTweetText.split('---THREAD_SEPARATOR---')[0] : finalTweetText;
    const tweetFilter = filterTweet(firstTweetPart);
    if (!tweetFilter.safe) {
      log.warn(`⛔ Tweet filtered for "${bounty.title}": ${tweetFilter.reason}`);
      continue;
    }

    saveTweetDraft(bounty.id, finalTweetText, templateUsed, isThread ? 'thread' : 'single');
    log.info(`📝 Tweet drafted for "${bounty.title}" (score: ${scores.viralScore}, method: ${templateUsed})`);

    if (flags.verbose) {
      console.log(`\n─── Draft for: ${bounty.title} ───`);
      console.log(`Category: ${category}`);
      console.log(`Score: ${scores.viralScore}/100`);
      console.log(`Tweet:\n${finalTweetText}`);
    }

    drafted++;
  }

  log.info(`✅ Drafted ${drafted} tweets`);
  return { drafted };
}

/**
 * POST: Post the next draft tweet to Twitter/X.
 * Flow: Upload image → Post main tweet with image → Reply with bounty link
 */
async function cmdPost(flags) {
  const maxDaily = parseInt(process.env.MAX_TWEETS_PER_DAY || '8', 10);
  const todayCount = getTodayTweetCount();

  if (todayCount >= maxDaily) {
    log.warn(`📛 Daily tweet limit reached (${todayCount}/${maxDaily}). Skipping post.`);
    return { posted: 0, reason: 'daily_limit' };
  }

  const drafts = getDraftTweets(flags.limit || 1);

  if (drafts.length === 0) {
    log.info('📭 No draft tweets to post');
    return { posted: 0, reason: 'no_drafts' };
  }

  let posted = 0;

  for (const draft of drafts) {
    const currentTodayCount = getTodayTweetCount();
    if (currentTodayCount >= maxDaily) {
      log.warn(`📛 Daily tweet limit reached during posting loop (${currentTodayCount}/${maxDaily}). Stopping.`);
      break;
    }

    log.info(`\n📤 Posting tweet for: ${draft.bounty_title || 'Unknown'}`);
    console.log(`\n${'─'.repeat(50)}`);
    console.log(draft.tweet_text.split(/\s*-+\s*THREAD_SEPARATOR\s*-+\s*/i)[0]);
    console.log(`${'─'.repeat(50)}\n`);

    if (flags.dryRun) {
      log.info('🏃 DRY RUN — Tweet not actually posted');
      continue;
    }

    // ── Step 1: Get bounty media (download image or screenshot) ──
    let mediaId = null;
    let localMedia = null;
    try {
      const media = await getBountyMedia(draft);
      if (media) {
        localMedia = media;
        log.info(`📸 Uploading media to Twitter (${(media.buffer.length / 1024).toFixed(1)}KB)...`);
        const uploadResult = await uploadMedia(media.buffer, media.mimeType);
        if (uploadResult.success) {
          mediaId = uploadResult.mediaId;
          log.info(`✅ Media uploaded: ${mediaId}`);
        } else {
          log.warn(`⚠️ Media upload failed: ${uploadResult.error} — posting without image`);
        }
      }
    } catch (err) {
      log.warn(`⚠️ Media processing error: ${err.message} — posting without image`);
    }

    // Determine bounty link for reply
    const bountyLink = draft.source_url || '';

    // ── Step 2: Post tweet(s) ──
    if (draft.tweet_type === 'thread') {
      const threadParts = draft.tweet_text.split(/\s*-+\s*THREAD_SEPARATOR\s*-+\s*/i);

      // Send to Telegram with link appended
      const telegramText = threadParts.join('\n\n') + (bountyLink ? `\n\n🔗 ${bountyLink}` : '');
      if (localMedia) {
        const telResult = await sendTelegramPhoto(localMedia.buffer, telegramText);
        if (!telResult.success) {
          await sendTelegramMessage(telegramText);
        }
      } else {
        await sendTelegramMessage(telegramText);
      }

      // Post first tweet with media
      const firstResult = await postTweet(threadParts[0], { mediaId });
      if (!firstResult.success) {
        markTweetFailed(draft.id, firstResult.error);
        log.error(`❌ Thread first tweet failed: ${firstResult.error}`);
        continue;
      }

      let lastTweetId = firstResult.tweetId;
      let allSuccess = true;

      // Post remaining thread parts as replies
      for (let i = 1; i < threadParts.length; i++) {
        await sleep(1000);
        const partResult = await postTweet(threadParts[i], { replyToId: lastTweetId });
        if (!partResult.success) {
          log.error(`❌ Thread part ${i + 1} failed: ${partResult.error}`);
          allSuccess = false;
          break;
        }
        lastTweetId = partResult.tweetId;
      }

      // Post bounty link as final reply
      if (allSuccess && bountyLink) {
        await sleep(1000);
        const linkReply = `🔗 Link & details 👇\n\n${bountyLink}`;
        await postTweet(linkReply, { replyToId: lastTweetId });
        log.info(`🔗 Link reply posted under thread`);
      }

      markTweetPosted(draft.id, firstResult.tweetId);
      log.info(`✅ Thread posted! First tweet ID: ${firstResult.tweetId}`);
      posted++;

    } else {
      // ── Single tweet ──

      // Send to Telegram with link appended
      const telegramText = draft.tweet_text + (bountyLink ? `\n\n🔗 ${bountyLink}` : '');
      if (localMedia) {
        const telResult = await sendTelegramPhoto(localMedia.buffer, telegramText);
        if (!telResult.success) {
          await sendTelegramMessage(telegramText);
        }
      } else {
        await sendTelegramMessage(telegramText);
      }

      // Post main tweet with media attached (no link in text)
      const result = await postTweet(draft.tweet_text, { mediaId });

      if (result.success) {
        // Post bounty link as a reply to the main tweet
        if (bountyLink) {
          await sleep(1500);
          const linkReply = `🔗 Link & details 👇\n\n${bountyLink}`;
          const replyResult = await postTweet(linkReply, { replyToId: result.tweetId });
          if (replyResult.success) {
            log.info(`🔗 Link reply posted: ${replyResult.tweetId}`);
          } else {
            log.warn(`⚠️ Link reply failed: ${replyResult.error}`);
          }
        }

        markTweetPosted(draft.id, result.tweetId);
        log.info(`✅ Tweet posted! ID: ${result.tweetId}`);
        posted++;
      } else {
        markTweetFailed(draft.id, result.error);
        log.error(`❌ Tweet posting failed: ${result.error}`);
      }
    }

    // Respect rate limits — wait between posts
    if (drafts.indexOf(draft) < drafts.length - 1) {
      log.info('⏳ Waiting 5s between posts...');
      await sleep(5000);
    }
  }

  // Update daily stats
  updateDailyStats({ tweetsPosted: getTodayTweetCount() });

  log.info(`✅ Posted ${posted}/${drafts.length} tweets (${getTodayTweetCount()}/${maxDaily} daily limit)`);
  return { posted };
}

/**
 * CHECK COMPLETIONS: Check previously tweeted bounties for completions and post success stories.
 * Flow: Find posted bounties → Check each for completion → Download winner media → Quote tweet original
 */
async function cmdCheckCompletions(flags) {
  log.info('🏆 Checking for completed bounties...');

  const postedBounties = getPostedBountiesForCompletionCheck();
  log.info(`Found ${postedBounties.length} posted bounties to check for completions`);

  if (postedBounties.length === 0) {
    return { detected: 0, posted: 0 };
  }

  // Limit how many bounties we check per run to avoid long scraping sessions
  const checkLimit = Math.min(flags.limit || 5, postedBounties.length);
  const toCheck = postedBounties.slice(0, checkLimit);

  let detected = 0;

  for (const bounty of toCheck) {
    if (!bounty.source_url || bounty.source_url.length < 10) {
      log.warn(`Skipping bounty "${bounty.title}" — no valid source URL`);
      continue;
    }

    try {
      const result = await checkBountyCompletion(bounty.source_url);

      if (result.completed && result.winner) {
        log.info(`✅ Completion detected: "${bounty.title}" — winner: ${result.winner.username || 'unknown'}`);

        insertCompletion({
          bountyId: bounty.id,
          winnerUsername: result.winner.username,
          winnerMediaUrl: result.winner.mediaUrl,
          winnerMediaType: result.winner.mediaType,
          winnerDescription: result.winner.description,
          originalTweetId: bounty.original_twitter_id,
        });

        detected++;
      } else if (result.completed) {
        log.info(`📋 Bounty "${bounty.title}" appears completed but no winner media found`);
        // Still record it so we don't re-check, but with no media
        insertCompletion({
          bountyId: bounty.id,
          winnerUsername: '',
          winnerMediaUrl: '',
          winnerMediaType: '',
          winnerDescription: '',
          originalTweetId: bounty.original_twitter_id,
        });
        detected++;
      }
    } catch (err) {
      log.error(`Error checking completion for "${bounty.title}": ${err.message}`);
    }

    // Be respectful — wait between page loads
    await sleep(2000);
  }

  log.info(`🔍 Completion check done: ${detected} completions detected out of ${toCheck.length} checked`);

  // Now post success story tweets for any unposted completions
  let posted = 0;

  if (flags.dryRun) {
    const unposted = getUnpostedCompletions(5);
    if (unposted.length > 0) {
      log.info('🏃 DRY RUN — Success story tweets not actually posted:');
      for (const completion of unposted) {
        const { text } = generateSuccessStoryTweet(completion, completion);
        console.log(`\n${'─'.repeat(50)}`);
        console.log(`[Quote Tweet of: ${completion.original_tweet_id}]`);
        console.log(text);
        console.log(`${'─'.repeat(50)}`);
      }
    }
    return { detected, posted: 0 };
  }

  const unpostedCompletions = getUnpostedCompletions(flags.limit || 1);

  for (const completion of unpostedCompletions) {
    // Skip if no original tweet ID to quote
    if (!completion.original_tweet_id) {
      log.warn(`Skipping success story for "${completion.title}" — no original tweet ID to quote`);
      continue;
    }

    // Generate success story tweet text
    const { text, templateUsed } = generateSuccessStoryTweet(completion, completion);

    log.info(`📤 Posting success story for: "${completion.title}"`);
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[Quote Tweet of: ${completion.original_tweet_id}]`);
    console.log(text);
    console.log(`${'─'.repeat(50)}\n`);

    // Download winner's media if available
    let mediaId = null;
    if (completion.winner_media_url) {
      try {
        const media = await downloadSubmissionMedia(
          completion.winner_media_url,
          completion.winner_media_type,
          completion.bounty_id
        );
        if (media) {
          log.info(`📸 Uploading winner media to Twitter (${(media.buffer.length / 1024).toFixed(1)}KB)...`);
          const uploadResult = await uploadMedia(media.buffer, media.mimeType);
          if (uploadResult.success) {
            mediaId = uploadResult.mediaId;
            log.info(`✅ Winner media uploaded: ${mediaId}`);
          } else {
            log.warn(`⚠️ Winner media upload failed: ${uploadResult.error}`);
          }
        }
      } catch (err) {
        log.warn(`⚠️ Winner media processing error: ${err.message}`);
      }
    }

    // Post the quote tweet
    const tweetResult = await postTweet(text, {
      mediaId,
      quoteTweetId: completion.original_tweet_id,
    });

    if (tweetResult.success) {
      markCompletionPosted(completion.bounty_id, tweetResult.tweetId);
      log.info(`✅ Success story posted! Tweet ID: ${tweetResult.tweetId}`);

      // Also send to Telegram
      const telegramText = `🏆 Success Story!\n\n${text}\n\n📎 Original: https://x.com/i/web/status/${completion.original_tweet_id}`;
      await sendTelegramMessage(telegramText);

      posted++;
    } else {
      log.error(`❌ Success story posting failed: ${tweetResult.error}`);
    }

    // Rate limit respect
    await sleep(3000);
  }

  log.info(`✅ Success stories: ${detected} detected, ${posted} posted`);
  return { detected, posted };
}

/**
 * RECAP: Generate and post a daily recap tweet.
 */
async function cmdRecap(flags) {
  log.info('📊 Generating daily recap...');

  const recentBounties = getRecentBounties(24);
  const topBounties = getTopScoredBounties(10);

  if (recentBounties.length === 0) {
    log.info('No bounties in the last 24 hours for recap');
    return { posted: false };
  }

  let biggestBounty = null;
  for (const b of recentBounties) {
    if (!biggestBounty || (b.reward_amount || 0) > (biggestBounty.reward_amount || 0)) {
      biggestBounty = b;
    }
  }
  const biggestReward = biggestBounty ? (biggestBounty.reward_amount || 0) : 0;
  const biggestRewardUsd = biggestBounty ? (biggestBounty.reward_usd || 0) : 0;

  const mostAbsurd = topBounties.length > 0 ? topBounties[0].title : 'N/A';
  const avgScore = topBounties.length > 0
    ? topBounties.reduce((sum, b) => sum + (b.viral_score || 0), 0) / topBounties.length
    : 0;
 
  const recapData = {
    totalBounties: recentBounties.length,
    biggestReward,
    biggestRewardUsd,
    mostAbsurd,
    avgScore,
  };
 
  const { text, templateUsed } = generateRecapTweet(recapData);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(text);
  console.log(`${'─'.repeat(50)}\n`);

  if (flags.dryRun) {
    log.info('🏃 DRY RUN — Recap not posted');
    return { posted: false, text };
  }

  // Send to Telegram (Independent of Twitter)
  await sendTelegramMessage(text);

  const result = await postTweet(text);
  if (result.success) {
    saveTweetDraft(null, text, templateUsed);
    markTweetPosted(result.tweetId, result.tweetId);
    log.info(`✅ Daily recap posted! ID: ${result.tweetId}`);
  } else {
    log.error(`❌ Recap posting failed: ${result.error}`);
  }

  return { posted: result.success, text };
}

/**
 * AUTO: Run the full pipeline — scan → score → draft → post.
 * Completions are checked on a separate schedule in cron mode.
 */
async function cmdAuto(flags) {
  log.info('🤖 Starting auto pipeline...');

  const scanResult = await cmdScan(flags);
  const scoreResult = await cmdScore(flags);
  const draftResult = await cmdDraft(flags);

  const shouldPost = flags.auto || process.env.AUTO_POST === 'true';

  let postResult = { posted: 0 };
  if (shouldPost) {
    // When running automatically in the pipeline, post only 1 tweet per run
    // to distribute posts evenly across cron schedules
    const postFlags = { ...flags, limit: 1 };
    postResult = await cmdPost(postFlags);
  } else {
    log.info('📝 Draft mode — tweets saved but not posted. Use --auto to post.');
    const drafts = getDraftTweets(5);
    if (drafts.length > 0) {
      console.log('\n📋 Pending drafts:');
      for (const draft of drafts) {
        console.log(`  • [Score: ${draft.viral_score || '?'}] ${draft.bounty_title || 'Unknown'}`);
      }
    }
  }

  log.info('\n📊 Pipeline summary:');
  log.info(`  Bounties scraped: ${scanResult.newCount}`);
  log.info(`  Bounties scored: ${scoreResult.scored}`);
  log.info(`  Tweets drafted: ${draftResult.drafted}`);
  log.info(`  Tweets posted: ${postResult.posted}`);
}

/**
 * CRON: Start the scheduled auto-runner.
 * Bounty pipeline runs every hour, completions check runs every 3 hours.
 */
async function cmdCron(flags) {
  const port = process.env.PORT || 3000;
  const server = startServer(port);

  const scanCron = process.env.SCAN_CRON || '0 * * * *'; // every hour
  const completionCron = process.env.COMPLETION_CRON || '0 */3 * * *'; // every 3 hours
  log.info(`⏰ Bounty pipeline cron: ${scanCron}`);
  log.info(`⏰ Completion check cron: ${completionCron}`);
  log.info('Press Ctrl+C to stop\n');

  // Run immediately on start
  await cmdAuto(flags);
  // Also check completions immediately
  if (flags.auto || process.env.AUTO_POST === 'true') {
    await cmdCheckCompletions(flags);
  }

  // Schedule bounty pipeline (hourly by default)
  cron.schedule(scanCron, async () => {
    log.info(`\n${'═'.repeat(60)}`);
    log.info(`🔄 Hourly bounty run at ${new Date().toISOString()}`);
    log.info(`${'═'.repeat(60)}\n`);

    try {
      await cmdAuto(flags);
    } catch (error) {
      log.error(`Scheduled bounty run failed: ${error.message}`);
    }
  });

  // Schedule completion check (every 3 hours by default)
  cron.schedule(completionCron, async () => {
    log.info(`\n${'═'.repeat(60)}`);
    log.info(`🏆 Completion check at ${new Date().toISOString()}`);
    log.info(`${'═'.repeat(60)}\n`);

    try {
      await cmdCheckCompletions(flags);
    } catch (error) {
      log.error(`Completion check failed: ${error.message}`);
    }
  });

  // Schedule daily recap at 9 PM UTC
  cron.schedule('0 21 * * *', async () => {
    log.info('\n📊 Daily recap time...');
    try {
      await cmdRecap(flags);
    } catch (error) {
      log.error(`Recap failed: ${error.message}`);
    }
  });

  // Keep process alive
  process.on('SIGINT', () => {
    log.info('\n👋 Shutting down...');
    if (server) {
      server.close();
    }
    closeDatabase();
    process.exit(0);
  });
}

/**
 * STATUS: Show current database stats.
 */
async function cmdStatus() {
  const activeBounties = getActiveBounties();
  const topBounties = getTopScoredBounties(5);
  const drafts = getDraftTweets(10);
  const todayStats = getTodayStats();
  const todayTweets = getTodayTweetCount();
  const filterStats = getFilterStats();

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║           BountyFeedHQ Status Dashboard          ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  console.log(`📦 Active bounties: ${activeBounties.length}`);
  console.log(`📝 Pending drafts: ${drafts.length}`);
  console.log(`📤 Tweets posted today: ${todayTweets}/${process.env.MAX_TWEETS_PER_DAY || 15}`);
  console.log(`🔒 Safety filter: ${filterStats.total} blocked keywords across ${Object.keys(filterStats).length - 1} categories`);

  if (todayStats) {
    console.log(`\n📊 Today's stats:`);
    console.log(`   Bounties scraped: ${todayStats.bounties_scraped}`);
    console.log(`   Highest reward: ${todayStats.highest_bounty_reward} SOL`);
    console.log(`   Avg viral score: ${todayStats.avg_viral_score}`);
  }

  if (topBounties.length > 0) {
    console.log('\n🏆 Top bounties by viral score:');
    for (const b of topBounties) {
      console.log(`   ${b.viral_score}/100 | ${b.reward_amount} SOL | ${b.title.slice(0, 50)}`);
    }
  }

  if (drafts.length > 0) {
    console.log('\n📋 Pending drafts:');
    for (const d of drafts.slice(0, 5)) {
      const preview = d.tweet_text.split('\n')[0].slice(0, 60);
      console.log(`   [#${d.id}] ${preview}...`);
    }
  }

  console.log('');
}

/**
 * VERIFY: Verify Twitter API credentials.
 */
async function cmdVerify() {
  log.info('🔐 Verifying Twitter API credentials...');
  const result = await verifyCredentials();

  if (result.valid) {
    console.log(`\n✅ Authenticated as @${result.username}`);
  } else {
    console.log(`\n❌ Authentication failed: ${result.error}`);
    console.log('\nMake sure your .env file has valid Twitter API credentials.');
    console.log('Get them from: https://developer.twitter.com/en/portal/dashboard');
  }
}

// ─── Help ────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════╗
║              BountyFeedHQ v1.0.0                 ║
║   Curate viral bounties from Pump.fun GO         ║
╚══════════════════════════════════════════════════╝

Usage: node src/index.js <command> [flags]

Commands:
  scan          Scrape pump.fun/go for new bounties
  score         Score all unscored bounties for viral potential
  draft         Generate tweet drafts for high-scoring bounties
  post          Post the next draft tweet to Twitter/X
  auto          Run the full pipeline (scan → score → draft → post)
  completions   Check posted bounties for completions & post success stories
  recap         Generate and post a daily recap tweet
  cron          Hourly bounty pipeline + 3h completion check + web server
  server        Start the web server dashboard only
  status        Show database stats and pending drafts
  verify        Verify Twitter API credentials

Flags:
  --dry-run, -n    Simulate without posting to Twitter
  --auto, -a       Auto-post tweets (in 'auto' command)
  --limit N        Limit number of items to process
  --verbose, -v    Enable debug logging
  --help, -h       Show this help message

Examples:
  node src/index.js scan                # Scrape new bounties
  node src/index.js auto --dry-run      # Full pipeline, no posting
  node src/index.js auto --auto         # Full pipeline with auto-posting
  node src/index.js completions         # Check & post success stories
  node src/index.js cron --auto         # Scheduled with auto-posting
  node src/index.js post --limit 3      # Post next 3 drafts
  node src/index.js status              # Show dashboard
`);
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const { command, flags } = parseArgs();

  if (flags.help) {
    showHelp();
    return;
  }

  // Initialize database
  initDatabase();

  // One-time cleanup for toes, parade, and attention bounties to repost them with correct rewards, and clear stale drafts
  try {
    const db = getDb();
    
    // Disable foreign keys temporarily during cleanup to avoid constraints failing on stale/deleted data
    db.pragma('foreign_keys = OFF');

    // 1. toes cleanup
    const toesUuid = '97672ce0-3348-40fe-a2d7-563539000943';
    db.prepare('DELETE FROM tweets WHERE bounty_id = ?').run(toesUuid);
    db.prepare('DELETE FROM scores WHERE bounty_id = ?').run(toesUuid);
    db.prepare('DELETE FROM submissions WHERE bounty_id = ?').run(toesUuid);
    db.prepare('DELETE FROM bounties WHERE id = ?').run(toesUuid);

    // 2. parade cleanup to trigger correct repost
    const paradeUuid = '098b7525-1ed3-467c-aeb2-f93a4d823956';
    db.prepare('DELETE FROM tweets WHERE bounty_id = ? OR tweet_text LIKE ?').run(paradeUuid, '%go to a parade%');
    db.prepare('DELETE FROM scores WHERE bounty_id = ?').run(paradeUuid);
    db.prepare('DELETE FROM submissions WHERE bounty_id = ?').run(paradeUuid);
    db.prepare('DELETE FROM bounties WHERE id = ? OR source_url LIKE ?').run(paradeUuid, '%098b7525%');

    // 3. attention business shill cleanup to trigger correct repost
    const attentionUuid = '683a7b0c-58e8-4d37-8adf-2431c4d8837a';
    db.prepare('DELETE FROM tweets WHERE bounty_id = ? OR tweet_text LIKE ?').run(attentionUuid, '%ATTENTION%');
    db.prepare('DELETE FROM scores WHERE bounty_id = ?').run(attentionUuid);
    db.prepare('DELETE FROM submissions WHERE bounty_id = ?').run(attentionUuid);
    db.prepare('DELETE FROM bounties WHERE id = ? OR source_url LIKE ?').run(attentionUuid, '%683a7b0c%');

    // 4. Clear all unsent drafts and their corresponding unscored/undrafted bounties to start clean with new scraper
    db.prepare("DELETE FROM tweets WHERE status != 'posted'").run();
    db.prepare("DELETE FROM scores WHERE bounty_id NOT IN (SELECT bounty_id FROM tweets WHERE status = 'posted')").run();
    db.prepare("DELETE FROM submissions WHERE bounty_id NOT IN (SELECT bounty_id FROM tweets WHERE status = 'posted')").run();
    db.prepare("DELETE FROM bounties WHERE id NOT IN (SELECT bounty_id FROM tweets WHERE status = 'posted')").run();

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');

    log.info(`🧹 One-time cleanup: Cleared stale drafts and removed toes/parade/attention bounties to trigger correct repost.`);
  } catch (err) {
    log.warn(`Failed to run database cleanup: ${err.message}`);
    try {
      const db = getDb();
      db.pragma('foreign_keys = ON');
    } catch (_) {}
  }

  // Handle FORCE_RESCORE environment variable to clear and recalculate
  if (process.env.FORCE_RESCORE === 'true') {
    log.info('🔄 FORCE_RESCORE is enabled. Clearing database tables to start completely fresh...');
    const db = getDb();
    try {
      db.prepare('DELETE FROM submissions').run();
      db.prepare('DELETE FROM scores').run();
      db.prepare('DELETE FROM tweets').run();
      db.prepare('DELETE FROM bounties').run();
      log.info('✅ Database tables cleared. Ready to rescrape and rescore.');
    } catch (err) {
      log.error(`Failed to execute FORCE_RESCORE: ${err.message}`);
    }
  }

  // Initialize Twitter client (for commands that need it)
  if (['post', 'auto', 'cron', 'recap', 'verify', 'completions'].includes(command)) {
    initTwitterClient();
  }

  try {
    switch (command) {
      case 'scan':
        await cmdScan(flags);
        break;
      case 'score':
        await cmdScore(flags);
        break;
      case 'draft':
        await cmdDraft(flags);
        break;
      case 'post':
        await cmdPost(flags);
        break;
      case 'recap':
        await cmdRecap(flags);
        break;
      case 'auto':
        await cmdAuto(flags);
        break;
      case 'completions':
        await cmdCheckCompletions(flags);
        break;
      case 'cron':
        await cmdCron(flags);
        return; // Don't close DB for cron
      case 'server':
        const port = process.env.PORT || 3000;
        startServer(port);
        // Keep process alive
        process.on('SIGINT', () => {
          log.info('\n👋 Shutting down server...');
          closeDatabase();
          process.exit(0);
        });
        return; // Don't close DB for server
      case 'status':
        await cmdStatus();
        break;
      case 'verify':
        await cmdVerify();
        break;
      default:
        log.error(`Unknown command: ${command}`);
        showHelp();
        break;
    }
  } catch (error) {
    log.error(`Command '${command}' failed: ${error.message}`);
    if (flags.verbose) {
      console.error(error);
    }
    process.exitCode = 1;
  } finally {
    if (command !== 'cron' && command !== 'server') {
      closeDatabase();
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();

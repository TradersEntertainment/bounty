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
  upsertBounty, upsertSubmission, upsertScore,
  getUnscoredBounties, getUndraftedBounties, getDraftTweets,
  getActiveBounties, getRecentBounties, getTopScoredBounties,
  saveTweetDraft, markTweetPosted, markTweetFailed,
  getTodayTweetCount, bountyHasTweet, updateDailyStats, getTodayStats,
} from './database.js';
import { scrapeBounties, scrapeSubmissions, scrapeAll } from './scraper.js';
import { scoreBounty, categorizeBounty, formatScoreSummary } from './scorer.js';
import { generateTweet, generateRecapTweet, generateThread } from './templates.js';
import { filterBounty, filterTweet, getFilterStats } from './filter.js';
import { postTweet, postThread, verifyCredentials, initTwitterClient } from './twitter.js';
import { sendTelegramMessage } from './telegram.js';
import { startServer } from './server.js';

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
  for (const bounty of unscored) {
    const scores = scoreBounty(bounty);
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
    const { text, templateUsed } = generateTweet(bounty, category);

    // Safety check on generated tweet
    const tweetFilter = filterTweet(text);
    if (!tweetFilter.safe) {
      log.warn(`⛔ Tweet filtered for "${bounty.title}": ${tweetFilter.reason}`);
      continue;
    }

    // Check for threads (very high score bounties)
    if (scores.viralScore >= 80) {
      const thread = generateThread(bounty, scores);
      saveTweetDraft(bounty.id, thread.join('\n---THREAD_SEPARATOR---\n'), templateUsed, 'thread');
      log.info(`🧵 Thread drafted for "${bounty.title}" (score: ${scores.viralScore})`);
    } else {
      saveTweetDraft(bounty.id, text, templateUsed, 'single');
      log.info(`📝 Tweet drafted for "${bounty.title}" (score: ${scores.viralScore})`);
    }

    if (flags.verbose) {
      console.log(`\n─── Draft for: ${bounty.title} ───`);
      console.log(`Category: ${category}`);
      console.log(`Score: ${scores.viralScore}/100`);
      console.log(`Tweet:\n${text}`);
    }

    drafted++;
  }

  log.info(`✅ Drafted ${drafted} tweets`);
  return { drafted };
}

/**
 * POST: Post the next draft tweet to Twitter/X.
 */
async function cmdPost(flags) {
  const maxDaily = parseInt(process.env.MAX_TWEETS_PER_DAY || '15', 10);
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
    log.info(`\n📤 Posting tweet for: ${draft.bounty_title || 'Unknown'}`);
    console.log(`\n${'─'.repeat(50)}`);
    console.log(draft.tweet_text.split('---THREAD_SEPARATOR---')[0]);
    console.log(`${'─'.repeat(50)}\n`);

    if (flags.dryRun) {
      log.info('🏃 DRY RUN — Tweet not actually posted');
      continue;
    }

    // Handle threads
    if (draft.tweet_type === 'thread') {
      const threadParts = draft.tweet_text.split('\n---THREAD_SEPARATOR---\n');
      const result = await postThread(threadParts);

      if (result.success) {
        markTweetPosted(draft.id, result.tweetIds[0]);
        log.info(`✅ Thread posted! First tweet ID: ${result.tweetIds[0]}`);
        posted++;

        // Send to Telegram as a unified post
        const telegramText = threadParts.join('\n\n');
        await sendTelegramMessage(telegramText);
      } else {
        markTweetFailed(draft.id, result.error);
        log.error(`❌ Thread posting failed: ${result.error}`);
      }
    } else {
      // Single tweet
      const result = await postTweet(draft.tweet_text);

      if (result.success) {
        markTweetPosted(draft.id, result.tweetId);
        log.info(`✅ Tweet posted! ID: ${result.tweetId}`);
        posted++;

        // Send to Telegram
        await sendTelegramMessage(draft.tweet_text);
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

  const biggestReward = recentBounties.reduce((max, b) => Math.max(max, b.reward_amount || 0), 0);
  const mostAbsurd = topBounties.length > 0 ? topBounties[0].title : 'N/A';
  const avgScore = topBounties.length > 0
    ? topBounties.reduce((sum, b) => sum + (b.viral_score || 0), 0) / topBounties.length
    : 0;

  const recapData = {
    totalBounties: recentBounties.length,
    biggestReward,
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

  const result = await postTweet(text);
  if (result.success) {
    saveTweetDraft(null, text, templateUsed);
    markTweetPosted(result.tweetId, result.tweetId);
    log.info(`✅ Daily recap posted! ID: ${result.tweetId}`);

    // Send to Telegram
    await sendTelegramMessage(text);
  } else {
    log.error(`❌ Recap posting failed: ${result.error}`);
  }

  return { posted: result.success, text };
}

/**
 * AUTO: Run the full pipeline — scan → score → draft → post.
 */
async function cmdAuto(flags) {
  log.info('🤖 Starting auto pipeline...');

  const scanResult = await cmdScan(flags);
  const scoreResult = await cmdScore(flags);
  const draftResult = await cmdDraft(flags);

  const shouldPost = flags.auto || process.env.AUTO_POST === 'true';

  let postResult = { posted: 0 };
  if (shouldPost) {
    postResult = await cmdPost(flags);
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
 */
async function cmdCron(flags) {
  const port = process.env.PORT || 3000;
  const server = startServer(port);

  const cronExpr = process.env.SCAN_CRON || '*/30 * * * *';
  log.info(`⏰ Starting cron scheduler: ${cronExpr}`);
  log.info('Press Ctrl+C to stop\n');

  // Run immediately on start
  await cmdAuto(flags);

  // Schedule recurring runs
  cron.schedule(cronExpr, async () => {
    log.info(`\n${'═'.repeat(60)}`);
    log.info(`🔄 Scheduled run at ${new Date().toISOString()}`);
    log.info(`${'═'.repeat(60)}\n`);

    try {
      await cmdAuto(flags);
    } catch (error) {
      log.error(`Scheduled run failed: ${error.message}`);
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
  scan        Scrape pump.fun/go for new bounties
  score       Score all unscored bounties for viral potential
  draft       Generate tweet drafts for high-scoring bounties
  post        Post the next draft tweet to Twitter/X
  recap       Generate and post a daily recap tweet
  auto        Run the full pipeline (scan → score → draft → post)
  cron        Start the scheduled auto-runner & launch web server
  server      Start the web server dashboard only
  status      Show database stats and pending drafts
  verify      Verify Twitter API credentials

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

  // Initialize Twitter client (for commands that need it)
  if (['post', 'auto', 'cron', 'recap', 'verify'].includes(command)) {
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

import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

let db = null;

/**
 * Initialize the SQLite database and create tables if they don't exist.
 */
export function initDatabase(dbPath) {
  const resolvedPath = resolve(PROJECT_ROOT, dbPath || process.env.DB_PATH || './data/bounties.db');
  const dir = dirname(resolvedPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  return db;
}

/**
 * Get the database instance, initializing if necessary.
 */
export function getDb() {
  if (!db) {
    initDatabase();
  }
  return db;
}

/**
 * Create all required tables.
 */
function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bounties (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      reward_amount REAL DEFAULT 0,
      reward_currency TEXT DEFAULT 'SOL',
      reward_usd REAL DEFAULT 0,
      creator TEXT,
      creator_avatar TEXT,
      deadline TEXT,
      status TEXT DEFAULT 'active',
      submission_count INTEGER DEFAULT 0,
      category TEXT,
      tags TEXT,
      image_url TEXT,
      source_url TEXT,
      scraped_at TEXT NOT NULL,
      updated_at TEXT,
      raw_data TEXT
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      bounty_id TEXT,
      submitter TEXT,
      submitter_avatar TEXT,
      media_url TEXT,
      media_type TEXT,
      description TEXT,
      status TEXT DEFAULT 'pending',
      votes INTEGER DEFAULT 0,
      source_url TEXT,
      scraped_at TEXT NOT NULL,
      raw_data TEXT,
      FOREIGN KEY (bounty_id) REFERENCES bounties(id)
    );

    CREATE TABLE IF NOT EXISTS scores (
      bounty_id TEXT PRIMARY KEY,
      viral_score REAL DEFAULT 0,
      reward_score REAL DEFAULT 0,
      absurdity_score REAL DEFAULT 0,
      doability_score REAL DEFAULT 0,
      visual_score REAL DEFAULT 0,
      timing_score REAL DEFAULT 0,
      scored_at TEXT NOT NULL,
      FOREIGN KEY (bounty_id) REFERENCES bounties(id)
    );

    CREATE TABLE IF NOT EXISTS tweets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bounty_id TEXT,
      tweet_text TEXT NOT NULL,
      tweet_type TEXT DEFAULT 'single',
      template_used TEXT,
      status TEXT DEFAULT 'draft',
      twitter_id TEXT,
      posted_at TEXT,
      created_at TEXT NOT NULL,
      error_message TEXT,
      FOREIGN KEY (bounty_id) REFERENCES bounties(id)
    );

    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      bounties_scraped INTEGER DEFAULT 0,
      tweets_posted INTEGER DEFAULT 0,
      highest_bounty_reward REAL DEFAULT 0,
      avg_viral_score REAL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status);
    CREATE INDEX IF NOT EXISTS idx_bounties_reward ON bounties(reward_amount DESC);
    CREATE INDEX IF NOT EXISTS idx_scores_viral ON scores(viral_score DESC);
    CREATE INDEX IF NOT EXISTS idx_tweets_status ON tweets(status);
    CREATE INDEX IF NOT EXISTS idx_tweets_date ON tweets(created_at);

    CREATE TABLE IF NOT EXISTS completions (
      bounty_id TEXT PRIMARY KEY,
      winner_username TEXT,
      winner_media_url TEXT,
      winner_media_type TEXT DEFAULT 'image',
      winner_description TEXT,
      original_tweet_id TEXT,
      completion_tweet_id TEXT,
      status TEXT DEFAULT 'detected',
      detected_at TEXT NOT NULL,
      posted_at TEXT,
      FOREIGN KEY (bounty_id) REFERENCES bounties(id)
    );

    CREATE INDEX IF NOT EXISTS idx_completions_status ON completions(status);
  `);

  // Retroactively add reward_usd if it doesn't exist
  try {
    db.prepare('ALTER TABLE bounties ADD COLUMN reward_usd REAL DEFAULT 0').run();
  } catch (err) {
    // Column already exists, ignore
  }
}

// ─── Bounty Operations ──────────────────────────────────────────────

/**
 * Insert or update a bounty. Returns true if new, false if updated.
 */
export function upsertBounty(bounty) {
  const stmt = db.prepare(`
    INSERT INTO bounties (id, title, description, reward_amount, reward_currency, reward_usd,
      creator, creator_avatar, deadline, status, submission_count, category, tags,
      image_url, source_url, scraped_at, raw_data)
    VALUES (@id, @title, @description, @reward_amount, @reward_currency, @reward_usd,
      @creator, @creator_avatar, @deadline, @status, @submission_count, @category, @tags,
      @image_url, @source_url, @scraped_at, @raw_data)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      reward_amount = excluded.reward_amount,
      reward_currency = excluded.reward_currency,
      reward_usd = excluded.reward_usd,
      status = excluded.status,
      submission_count = excluded.submission_count,
      deadline = excluded.deadline,
      image_url = excluded.image_url,
      updated_at = excluded.scraped_at,
      raw_data = excluded.raw_data
  `);

  const now = new Date().toISOString();
  const info = stmt.run({
    id: bounty.id,
    title: bounty.title || '',
    description: bounty.description || '',
    reward_amount: bounty.rewardAmount || 0,
    reward_currency: bounty.rewardCurrency || 'SOL',
    reward_usd: bounty.rewardUsd || 0,
    creator: bounty.creator || '',
    creator_avatar: bounty.creatorAvatar || '',
    deadline: bounty.deadline || '',
    status: bounty.status || 'active',
    submission_count: bounty.submissionCount || 0,
    category: bounty.category || '',
    tags: bounty.tags ? JSON.stringify(bounty.tags) : '',
    image_url: bounty.imageUrl || '',
    source_url: bounty.sourceUrl || '',
    scraped_at: now,
    raw_data: bounty.rawData ? JSON.stringify(bounty.rawData) : '',
  });

  return info.changes > 0;
}

/**
 * Get a bounty by ID.
 */
export function getBounty(id) {
  return db.prepare('SELECT * FROM bounties WHERE id = ?').get(id);
}

/**
 * Get all active bounties.
 */
export function getActiveBounties() {
  return db.prepare('SELECT * FROM bounties WHERE status = ? ORDER BY reward_amount DESC').all('active');
}

/**
 * Get bounties that haven't been scored yet.
 */
export function getUnscoredBounties() {
  return db.prepare(`
    SELECT b.* FROM bounties b
    LEFT JOIN scores s ON b.id = s.bounty_id
    WHERE s.bounty_id IS NULL
  `).all();
}

/**
 * Get bounties that haven't had a tweet drafted yet.
 */
export function getUndraftedBounties(minScore = 0) {
  return db.prepare(`
    SELECT b.*, s.viral_score, s.absurdity_score, s.reward_score,
           s.doability_score, s.visual_score, s.timing_score
    FROM bounties b
    INNER JOIN scores s ON b.id = s.bounty_id
    LEFT JOIN tweets t ON b.id = t.bounty_id
    WHERE t.bounty_id IS NULL AND s.viral_score >= ?
    ORDER BY s.viral_score DESC
  `).all(minScore);
}

/**
 * Get recently scraped bounties (last N hours).
 */
export function getRecentBounties(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return db.prepare('SELECT * FROM bounties WHERE scraped_at >= ? ORDER BY reward_amount DESC').all(since);
}

// ─── Submission Operations ───────────────────────────────────────────

/**
 * Insert or update a submission.
 */
export function upsertSubmission(submission) {
  const stmt = db.prepare(`
    INSERT INTO submissions (id, bounty_id, submitter, submitter_avatar,
      media_url, media_type, description, status, votes, source_url, scraped_at, raw_data)
    VALUES (@id, @bounty_id, @submitter, @submitter_avatar,
      @media_url, @media_type, @description, @status, @votes, @source_url, @scraped_at, @raw_data)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      votes = excluded.votes,
      raw_data = excluded.raw_data
  `);

  const now = new Date().toISOString();
  try {
    stmt.run({
      id: submission.id,
      bounty_id: submission.bountyId || '',
      submitter: submission.submitter || '',
      submitter_avatar: submission.submitterAvatar || '',
      media_url: submission.mediaUrl || '',
      media_type: submission.mediaType || '',
      description: submission.description || '',
      status: submission.status || 'pending',
      votes: submission.votes || 0,
      source_url: submission.sourceUrl || '',
      scraped_at: now,
      raw_data: submission.rawData ? JSON.stringify(submission.rawData) : '',
    });
  } catch (error) {
    if (error.message.includes('FOREIGN KEY')) {
      // Quietly ignore since this happens when a parent bounty was filtered out due to safety settings
    } else {
      throw error;
    }
  }
}

/**
 * Get submissions for a bounty.
 */
export function getSubmissions(bountyId) {
  return db.prepare('SELECT * FROM submissions WHERE bounty_id = ? ORDER BY votes DESC').all(bountyId);
}

// ─── Score Operations ────────────────────────────────────────────────

/**
 * Save or update a bounty's viral score breakdown.
 */
export function upsertScore(bountyId, scores) {
  const stmt = db.prepare(`
    INSERT INTO scores (bounty_id, viral_score, reward_score, absurdity_score,
      doability_score, visual_score, timing_score, scored_at)
    VALUES (@bounty_id, @viral_score, @reward_score, @absurdity_score,
      @doability_score, @visual_score, @timing_score, @scored_at)
    ON CONFLICT(bounty_id) DO UPDATE SET
      viral_score = excluded.viral_score,
      reward_score = excluded.reward_score,
      absurdity_score = excluded.absurdity_score,
      doability_score = excluded.doability_score,
      visual_score = excluded.visual_score,
      timing_score = excluded.timing_score,
      scored_at = excluded.scored_at
  `);

  stmt.run({
    bounty_id: bountyId,
    viral_score: scores.viralScore || 0,
    reward_score: scores.rewardScore || 0,
    absurdity_score: scores.absurdityScore || 0,
    doability_score: scores.doabilityScore || 0,
    visual_score: scores.visualScore || 0,
    timing_score: scores.timingScore || 0,
    scored_at: new Date().toISOString(),
  });
}

/**
 * Get the top-scoring bounties.
 */
export function getTopScoredBounties(limit = 20) {
  return db.prepare(`
    SELECT b.*, s.viral_score, s.absurdity_score, s.reward_score,
           s.doability_score, s.visual_score, s.timing_score
    FROM bounties b
    INNER JOIN scores s ON b.id = s.bounty_id
    ORDER BY s.viral_score DESC
    LIMIT ?
  `).all(limit);
}

// ─── Tweet Operations ────────────────────────────────────────────────

/**
 * Save a tweet draft.
 */
export function saveTweetDraft(bountyId, tweetText, templateUsed, tweetType = 'single') {
  const stmt = db.prepare(`
    INSERT INTO tweets (bounty_id, tweet_text, tweet_type, template_used, status, created_at)
    VALUES (?, ?, ?, ?, 'draft', ?)
  `);

  const info = stmt.run(bountyId, tweetText, tweetType, templateUsed, new Date().toISOString());
  return info.lastInsertRowid;
}

/**
 * Get all draft tweets ready to post.
 */
export function getDraftTweets(limit = 10) {
  return db.prepare(`
    SELECT t.*, b.title as bounty_title, b.reward_amount, b.source_url, b.image_url, s.viral_score
    FROM tweets t
    LEFT JOIN bounties b ON t.bounty_id = b.id
    LEFT JOIN scores s ON t.bounty_id = s.bounty_id
    WHERE t.status = 'draft'
    ORDER BY s.viral_score DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Mark a tweet as posted.
 */
export function markTweetPosted(tweetDbId, twitterId) {
  db.prepare(`
    UPDATE tweets SET status = 'posted', twitter_id = ?, posted_at = ? WHERE id = ?
  `).run(twitterId, new Date().toISOString(), tweetDbId);
}

/**
 * Mark a tweet as failed.
 */
export function markTweetFailed(tweetDbId, errorMessage) {
  db.prepare(`
    UPDATE tweets SET status = 'failed', error_message = ? WHERE id = ?
  `).run(errorMessage, tweetDbId);
}

/**
 * Check if a bounty already has a tweet (any status).
 */
export function bountyHasTweet(bountyId) {
  const row = db.prepare('SELECT COUNT(*) as count FROM tweets WHERE bounty_id = ?').get(bountyId);
  return row.count > 0;
}

/**
 * Count tweets posted today.
 */
export function getTodayTweetCount() {
  const today = new Date().toISOString().split('T')[0];
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM tweets WHERE status = 'posted' AND posted_at LIKE ?"
  ).get(`${today}%`);
  return row.count;
}

// ─── Stats Operations ────────────────────────────────────────────────

/**
 * Update daily stats.
 */
export function updateDailyStats(stats) {
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT INTO daily_stats (date, bounties_scraped, tweets_posted, highest_bounty_reward, avg_viral_score)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      bounties_scraped = bounties_scraped + excluded.bounties_scraped,
      tweets_posted = excluded.tweets_posted,
      highest_bounty_reward = MAX(highest_bounty_reward, excluded.highest_bounty_reward),
      avg_viral_score = excluded.avg_viral_score
  `).run(today, stats.bountiesScraped || 0, stats.tweetsPosted || 0,
    stats.highestReward || 0, stats.avgViralScore || 0);
}

/**
 * Get stats for today.
 */
export function getTodayStats() {
  const today = new Date().toISOString().split('T')[0];
  return db.prepare('SELECT * FROM daily_stats WHERE date = ?').get(today);
}

// ─── Completion Operations ──────────────────────────────────────────

/**
 * Insert a new bounty completion record.
 */
export function insertCompletion(data) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO completions (bounty_id, winner_username, winner_media_url, winner_media_type,
      winner_description, original_tweet_id, status, detected_at)
    VALUES (@bounty_id, @winner_username, @winner_media_url, @winner_media_type,
      @winner_description, @original_tweet_id, 'detected', @detected_at)
  `);

  return stmt.run({
    bounty_id: data.bountyId,
    winner_username: data.winnerUsername || '',
    winner_media_url: data.winnerMediaUrl || '',
    winner_media_type: data.winnerMediaType || 'image',
    winner_description: data.winnerDescription || '',
    original_tweet_id: data.originalTweetId || '',
    detected_at: new Date().toISOString(),
  });
}

/**
 * Get bounties we've tweeted about that haven't been checked for completion yet.
 * Returns bounties that have a posted tweet but no entry in the completions table.
 */
export function getPostedBountiesForCompletionCheck() {
  return db.prepare(`
    SELECT b.*, t.twitter_id as original_twitter_id, t.tweet_text,
           s.viral_score, s.reward_score
    FROM bounties b
    INNER JOIN tweets t ON b.id = t.bounty_id
    LEFT JOIN scores s ON b.id = s.bounty_id
    LEFT JOIN completions c ON b.id = c.bounty_id
    WHERE t.status = 'posted'
      AND t.twitter_id IS NOT NULL
      AND c.bounty_id IS NULL
    ORDER BY t.posted_at DESC
  `).all();
}

/**
 * Get detected completions that haven't been posted as success story tweets yet.
 */
export function getUnpostedCompletions(limit = 5) {
  return db.prepare(`
    SELECT c.*, b.title, b.reward_amount, b.reward_currency, b.reward_usd,
           b.source_url, b.image_url
    FROM completions c
    INNER JOIN bounties b ON c.bounty_id = b.id
    WHERE c.status = 'detected'
    ORDER BY c.detected_at DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Mark a completion as posted with the success story tweet ID.
 */
export function markCompletionPosted(bountyId, completionTweetId) {
  db.prepare(`
    UPDATE completions SET status = 'posted', completion_tweet_id = ?, posted_at = ?
    WHERE bounty_id = ?
  `).run(completionTweetId, new Date().toISOString(), bountyId);
}

/**
 * Close the database connection.
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

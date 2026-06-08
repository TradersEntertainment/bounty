/**
 * Express Web Server for BountyFeedHQ
 * Serves the API endpoints and the premium frontend web UI.
 */

import express from 'express';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('server');
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

/**
 * Start the Express web server.
 *
 * @param {number|string} port - The port to listen on.
 */
export function startServer(port = 3000) {
  const app = express();

  // Middleware
  app.use(express.json());
  
  // Serve static files from public directory
  app.use(express.static(resolve(PROJECT_ROOT, 'public')));

  // API: Get latest statistics
  app.get('/api/stats', (req, res) => {
    try {
      const db = getDb();
      
      // Get general stats
      const totalBounties = db.prepare('SELECT COUNT(*) as count FROM bounties').get().count;
      const totalScored = db.prepare('SELECT COUNT(*) as count FROM scores').get().count;
      const totalPosted = db.prepare("SELECT COUNT(*) as count FROM tweets WHERE status = 'posted'").get().count;
      
      // Get stats for today
      const today = new Date().toISOString().split('T')[0];
      const todayStats = db.prepare('SELECT * FROM daily_stats WHERE date = ?').get(today) || {
        bounties_scraped: 0,
        tweets_posted: 0,
        highest_bounty_reward: 0,
        avg_viral_score: 0,
      };

      res.json({
        totalBounties,
        totalScored,
        totalPosted,
        today: {
          bountiesScraped: todayStats.bounties_scraped,
          tweetsPosted: todayStats.tweets_posted,
          highestReward: todayStats.highest_bounty_reward,
          avgViralScore: todayStats.avg_viral_score,
        }
      });
    } catch (error) {
      log.error(`Failed to fetch stats: ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  });

  // API: Get latest and featured bounties
  app.get('/api/bounties', (req, res) => {
    try {
      const db = getDb();
      const limit = parseInt(req.query.limit, 10) || 30;
      
      // Get recent bounties with their scores and tweet posting status
      const bounties = db.prepare(`
        SELECT b.id, b.title, b.description, b.reward_amount, b.reward_currency, b.reward_usd,
               b.creator, b.creator_avatar, b.deadline, b.status as bounty_status,
               b.submission_count, b.category, b.source_url, b.scraped_at,
               s.viral_score, s.absurdity_score, s.reward_score, s.doability_score, 
               s.visual_score, s.timing_score,
               t.status as post_status, t.twitter_id, t.posted_at, t.tweet_text
        FROM bounties b
        LEFT JOIN scores s ON b.id = s.bounty_id
        LEFT JOIN tweets t ON b.id = t.bounty_id
        ORDER BY b.scraped_at DESC
        LIMIT ?
      `).all(limit);

      res.json(bounties);
    } catch (error) {
      log.error(`Failed to fetch bounties: ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch bounties' });
    }
  });

  // Fallback to serving index.html for SPA routing
  app.use((req, res) => {
    res.sendFile(resolve(PROJECT_ROOT, 'public', 'index.html'));
  });

  // Start listening
  const server = app.listen(port, () => {
    log.info(`🌐 Web Server running on port ${port} (http://localhost:${port})`);
  });

  return server;
}

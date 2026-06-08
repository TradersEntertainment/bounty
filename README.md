# 🏴‍☠️ BountyFeedHQ

> Automated Twitter/X bot that curates viral, funny, and noteworthy bounties from [Pump.fun GO](https://pump.fun/go/bounties).

**@BountyFeedHQ** scrapes Pump.fun GO bounties, scores them for viral potential, generates degen-culture tweets, and posts them to Twitter/X — all on autopilot.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd bounty-feed-hq
npm install
```

### 2. Install Browser (Playwright)

```bash
npx playwright install chromium
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Twitter API credentials
```

### 4. Run a Scan

```bash
# Scrape bounties (dry run, no posting)
npm run scan

# Or use the CLI directly
node src/index.js scan --verbose
```

---

## 📦 Architecture

```
bounty-feed-hq/
├── src/
│   ├── index.js       # CLI orchestrator (main entry point)
│   ├── scraper.js     # Playwright scraper for pump.fun/go
│   ├── database.js    # SQLite operations (better-sqlite3)
│   ├── scorer.js      # Viral score calculator
│   ├── templates.js   # Tweet templates (degen culture)
│   ├── twitter.js     # X API v2 integration
│   ├── filter.js      # Content safety filter
│   └── logger.js      # Structured logging utility
├── data/
│   └── bounties.db    # SQLite database (auto-created)
├── .env.example       # Environment variables template
├── package.json
└── README.md
```

---

## 🎮 CLI Commands

| Command | Description |
|---------|-------------|
| `scan` | Scrape pump.fun/go for new bounties and submissions |
| `score` | Calculate viral scores for all unscored bounties |
| `draft` | Generate tweet drafts for high-scoring bounties |
| `post` | Post the next draft tweet to Twitter/X |
| `recap` | Generate and post a daily recap tweet |
| `auto` | Run the full pipeline: scan → score → draft → post |
| `cron` | Start the scheduled auto-runner |
| `status` | Show database stats and pending drafts |
| `verify` | Verify Twitter API credentials |

### Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--dry-run` | `-n` | Simulate without posting to Twitter |
| `--auto` | `-a` | Auto-post tweets (in `auto` command) |
| `--limit N` | | Limit number of items to process |
| `--verbose` | `-v` | Enable debug logging |
| `--help` | `-h` | Show help message |

### Examples

```bash
# Scrape new bounties
node src/index.js scan

# Full pipeline, dry run (no posting)
node src/index.js auto --dry-run

# Full pipeline with auto-posting
node src/index.js auto --auto

# Start scheduled runner (every 30 min by default)
node src/index.js cron --auto

# Post next 3 draft tweets
node src/index.js post --limit 3

# Check current status
node src/index.js status

# Verify Twitter credentials
node src/index.js verify
```

---

## 📊 Viral Scoring System

Each bounty is scored on 5 dimensions (0-100), weighted to produce a final viral score:

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| 💰 Reward | 25% | SOL bounty size (logarithmic scale) |
| 🤪 Absurdity | 30% | How wild/funny/shareable the task is |
| ✅ Doability | 15% | Sweet spot: not too easy, not impossible |
| 📸 Visual | 20% | Would it produce good photo/video content? |
| ⏰ Timing | 10% | Freshness, deadline urgency, trending status |

### Absurdity Keywords

- **High** (10pts): tattoo, skydive, naked, costume, public, megaphone, quit job, proposal, prank, dare, streak...
- **Medium** (5pts): interview, dance, sing, video, photo, challenge, eat, cook...
- **Low** (2pts): follow, like, retweet, share, comment, subscribe...

---

## 🐦 Tweet Templates

Tweets are categorized and generated using template pools:

| Category | Trigger | Style |
|----------|---------|-------|
| 🤣 Funny | Absurdity 30-59 | Meme energy, "bro what 😭" |
| 🐋 Big Bounty | Reward ≥ 10 SOL | WHALE ALERT vibes |
| ⚠️ Extreme | Absurdity ≥ 60 | "absolute madlad" energy |
| ✅ Completed | Status: completed | "THE MADLAD DID IT" celebration |
| 💸 Easy Money | High doability, low absurdity | "free money ser" |
| 📊 Daily Recap | Scheduled at 9 PM UTC | Stats summary |

All tweets use crypto/degen slang: *ser*, *anon*, *wagmi*, *degen*, *madlad*, *frfr*.

---

## 🔒 Content Safety

The filter blocks bounties and tweets containing:

- **Violence**: kill, murder, assault, weapon, gun...
- **Self-harm**: suicide, self-harm, overdose...
- **Illegal**: drugs, steal, rob, arson, fraud...
- **Harassment**: doxx, stalk, bully, threaten...
- **NSFW**: explicit sexual content
- **Custom**: add your own via `EXTRA_BLOCKED_KEYWORDS` in `.env`

---

## ⚙️ Configuration

All settings are in `.env`:

```env
# Twitter API (required for posting)
TWITTER_API_KEY=xxx
TWITTER_API_SECRET=xxx
TWITTER_ACCESS_TOKEN=xxx
TWITTER_ACCESS_SECRET=xxx

# Scraping schedule (cron expression)
SCAN_CRON=*/30 * * * *

# Scoring
MIN_VIRAL_SCORE=40        # Minimum score to draft a tweet

# Rate limiting
MAX_TWEETS_PER_DAY=15     # Daily tweet cap

# Mode
AUTO_POST=false            # true = auto-post, false = draft only
```

---

## 🛠️ Getting Twitter API Credentials

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new project and app
3. Set app permissions to **Read and Write**
4. Generate API keys and access tokens
5. Copy them to your `.env` file

---

## 📋 Database Schema

The SQLite database (`data/bounties.db`) has these tables:

- **bounties** — Scraped bounty data (title, description, reward, status, etc.)
- **submissions** — Bounty submissions with media URLs
- **scores** — Viral score breakdown per bounty
- **tweets** — Generated tweets with status tracking (draft/posted/failed)
- **daily_stats** — Aggregate daily statistics

---

## 🧪 Development

```bash
# Run with verbose logging
node src/index.js scan --verbose

# Test the full pipeline without posting
node src/index.js auto --dry-run --verbose

# Check database status
node src/index.js status
```

---

## 📜 License

MIT — Built for the degen economy. WAGMI 🚀

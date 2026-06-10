/**
 * Viral score calculator for bounties.
 *
 * Weights:
 *   - Reward:    25%  (how big is the SOL bounty)
 *   - Absurdity: 30%  (how wild/funny/shareable the task is)
 *   - Doability: 15%  (can someone actually do it — too easy = boring, impossible = no content)
 *   - Visual:    20%  (would this produce good photo/video content)
 *   - Timing:    10%  (is it fresh / trending / time-sensitive)
 */

import { scoreBountyWithLLM } from './llm.js';

const WEIGHTS = {
  reward: 0.25,
  absurdity: 0.30,
  doability: 0.15,
  visual: 0.20,
  timing: 0.10,
};

// ─── Absurdity Keywords ──────────────────────────────────────────────

const ABSURDITY_HIGH = [
  'tattoo', 'skydive', 'skydiving', 'naked', 'nude', 'costume', 'cosplay',
  'public', 'megaphone', 'quit job', 'quit my job', 'proposal', 'propose',
  'prank', 'dare', 'streak', 'streaking', 'bungee', 'cliff', 'shave head',
  'shave eyebrow', 'eat bug', 'eat insect', 'lick', 'drink hot sauce',
  'hot pepper', 'carolina reaper', 'ghost pepper', 'fire walk', 'ice bath',
  'polar plunge', 'wrestle', 'fight', 'boxing', 'sumo', 'mud',
  'toilet', 'dumpster', 'garbage', 'trash', 'sewage', 'worm',
  'marry', 'wedding', 'divorce', 'arrest', 'jail', 'handcuff',
  'helicopter', 'parachute', 'submarine', 'rocket', 'space',
  'billboard', 'times square', 'stadium', 'arena', 'stage',
  'president', 'celebrity', 'famous', 'politician', 'CEO',
];

const ABSURDITY_MEDIUM = [
  'interview', 'dance', 'dancing', 'sing', 'singing', 'karaoke',
  'video', 'photo', 'challenge', 'eat', 'eating', 'cook', 'cooking',
  'workout', 'exercise', 'marathon', 'triathlon', 'swimming',
  'climb', 'climbing', 'hike', 'camping', 'surf', 'surfing',
  'skateboard', 'rollerblad', 'bike', 'bicycle', 'motorcycle',
  'paint', 'painting', 'draw', 'drawing', 'sculpt', 'art',
  'magic trick', 'juggle', 'juggling', 'backflip', 'frontflip',
  'handstand', 'cartwheel', 'split', 'breakdanc',
  'impression', 'impersonat', 'accent', 'standup', 'comedy',
  'roast', 'rap', 'freestyle', 'beatbox', 'instrument',
];

const ABSURDITY_LOW = [
  'follow', 'like', 'retweet', 'share', 'comment', 'subscribe',
  'join', 'sign up', 'register', 'download', 'install', 'review',
  'rate', 'recommend', 'tag', 'mention', 'reply', 'post',
  'screenshot', 'dm', 'message', 'email', 'call',
];

// ─── Visual Keywords ─────────────────────────────────────────────────

const VISUAL_HIGH = [
  'video', 'film', 'record', 'recording', 'stream', 'streaming', 'live',
  'tiktok', 'instagram', 'youtube', 'reel', 'shorts',
  'photo', 'picture', 'selfie', 'pose', 'camera',
  'drone', 'aerial', 'underwater', 'slow motion', 'timelapse',
  'fireworks', 'explosion', 'fire', 'smoke', 'neon', 'glow',
  'costume', 'cosplay', 'outfit', 'uniform', 'mask',
  'stunt', 'trick', 'acrobat', 'parkour', 'freerun',
];

const VISUAL_MEDIUM = [
  'show', 'display', 'demonstrate', 'present', 'exhibit',
  'wear', 'dress', 'style', 'fashion', 'makeup',
  'paint', 'color', 'design', 'create', 'build', 'craft',
  'food', 'meal', 'dish', 'recipe', 'bake',
];

/**
 * Calculate the reward score (0-100).
 * Uses USD value when available, falls back to SOL-based tiers.
 */
function calcRewardScore(rewardAmount, rewardUsd = 0) {
  // Prefer USD value for scoring since token amounts vary wildly
  const usdValue = rewardUsd > 0 ? rewardUsd : (rewardAmount || 0) * 150; // rough SOL fallback

  if (usdValue <= 0) return 5;

  // USD reward tiers
  if (usdValue >= 15000) return 100;
  if (usdValue >= 7500) return 90;
  if (usdValue >= 3000) return 80;
  if (usdValue >= 1500) return 70;
  if (usdValue >= 750) return 60;
  if (usdValue >= 300) return 50;
  if (usdValue >= 150) return 40;
  if (usdValue >= 75) return 30;
  if (usdValue >= 15) return 20;
  return 10;
}

/**
 * Calculate the absurdity score (0-100).
 * How wild/funny/shareable the bounty task is.
 */
function calcAbsurdityScore(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  let score = 0;
  let matchCount = 0;

  // Check high absurdity keywords (10 points each, max 60)
  for (const keyword of ABSURDITY_HIGH) {
    if (text.includes(keyword)) {
      score += 10;
      matchCount++;
      if (score >= 60) break;
    }
  }

  // Check medium absurdity keywords (5 points each, max 25 from this tier)
  let mediumScore = 0;
  for (const keyword of ABSURDITY_MEDIUM) {
    if (text.includes(keyword)) {
      mediumScore += 5;
      matchCount++;
      if (mediumScore >= 25) break;
    }
  }
  score += mediumScore;

  // Check low absurdity keywords (2 points each, max 10 from this tier)
  let lowScore = 0;
  for (const keyword of ABSURDITY_LOW) {
    if (text.includes(keyword)) {
      lowScore += 2;
      matchCount++;
      if (lowScore >= 10) break;
    }
  }
  score += lowScore;

  // Bonus for combining multiple absurd elements
  if (matchCount >= 4) score += 15;
  else if (matchCount >= 3) score += 10;
  else if (matchCount >= 2) score += 5;

  // Bonus for exclamation marks and caps (indicates excitement)
  const exclamations = (title.match(/!/g) || []).length;
  if (exclamations >= 3) score += 5;

  const capsRatio = (title.match(/[A-Z]/g) || []).length / Math.max(title.length, 1);
  if (capsRatio > 0.5 && title.length > 5) score += 5;

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate the doability score (0-100).
 * Sweet spot: not too easy (boring) and not impossible (no content).
 * Bell curve scoring — medium difficulty is best.
 */
function calcDoabilityScore(title, description, rewardAmount) {
  const text = `${title} ${description}`.toLowerCase();

  // Detect difficulty level
  let difficultySignals = 0;

  // Easy signals (too easy = lower score)
  const easyKeywords = ['follow', 'like', 'retweet', 'share', 'comment', 'screenshot', 'tag', 'dm'];
  for (const k of easyKeywords) {
    if (text.includes(k)) difficultySignals--;
  }

  // Hard signals (too hard = lower score)
  const hardKeywords = ['skydive', 'tattoo', 'quit job', 'helicopter', 'submarine', 'rocket',
    'space', 'president', 'celebrity', 'stadium', 'billboard'];
  for (const k of hardKeywords) {
    if (text.includes(k)) difficultySignals++;
  }

  // Medium signals (just right = higher score)
  const mediumKeywords = ['video', 'dance', 'sing', 'challenge', 'photo', 'costume',
    'prank', 'dare', 'public', 'eat', 'cook'];
  let mediumMatches = 0;
  for (const k of mediumKeywords) {
    if (text.includes(k)) mediumMatches++;
  }

  // Base score from difficulty
  let score;
  if (difficultySignals <= -3) {
    // Too easy
    score = 30;
  } else if (difficultySignals >= 3) {
    // Very hard (but still interesting)
    score = 50;
  } else if (mediumMatches >= 2) {
    // Sweet spot
    score = 85;
  } else if (mediumMatches >= 1) {
    score = 70;
  } else {
    score = 55;
  }

  // Reward amount affects perceived doability — higher reward = someone might actually do it
  if (rewardAmount >= 10) score += 15;
  else if (rewardAmount >= 5) score += 10;
  else if (rewardAmount >= 1) score += 5;

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate the visual score (0-100).
 * Would completing this bounty produce good visual content?
 */
function calcVisualScore(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  let score = 10; // Base score

  // High visual keywords (12 points each)
  for (const keyword of VISUAL_HIGH) {
    if (text.includes(keyword)) {
      score += 12;
    }
  }

  // Medium visual keywords (6 points each)
  for (const keyword of VISUAL_MEDIUM) {
    if (text.includes(keyword)) {
      score += 6;
    }
  }

  // Bonus if title explicitly mentions video/photo proof
  if (/\b(video|film|record|proof)\b/i.test(title)) {
    score += 10;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate the timing score (0-100).
 * How fresh and time-sensitive is this bounty?
 */
function calcTimingScore(bounty) {
  let score = 50; // Default for unknown timing

  // Check deadline
  if (bounty.deadline) {
    try {
      const deadline = new Date(bounty.deadline);
      const now = new Date();
      const hoursLeft = (deadline - now) / (1000 * 60 * 60);

      if (hoursLeft < 0) {
        // Expired
        score = 10;
      } else if (hoursLeft <= 6) {
        // Ending very soon — URGENT, high engagement
        score = 95;
      } else if (hoursLeft <= 24) {
        // Ending today
        score = 80;
      } else if (hoursLeft <= 72) {
        // Ending in a few days
        score = 65;
      } else {
        // Plenty of time
        score = 45;
      }
    } catch {
      // Invalid date, use default
    }
  }

  // Boost if it was just scraped (fresh content)
  if (bounty.scraped_at) {
    const scrapedAge = (Date.now() - new Date(bounty.scraped_at).getTime()) / (1000 * 60 * 60);
    if (scrapedAge < 1) score += 15;
    else if (scrapedAge < 6) score += 10;
    else if (scrapedAge < 24) score += 5;
  }

  // Submission count — some submissions means it's trending
  if (bounty.submission_count || bounty.submissionCount) {
    const count = bounty.submission_count || bounty.submissionCount;
    if (count >= 10) score += 15;
    else if (count >= 5) score += 10;
    else if (count >= 1) score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate the full viral score for a bounty.
 * Returns an object with all sub-scores and the weighted total.
 */
export async function scoreBounty(bounty) {
  // Self-promotion override: If the bounty mentions BountyFeedHQ, give it a perfect score
  // to guarantee it gets drafted and posted as an advertisement for the bot itself.
  const lowerText = `${bounty.title || ''} ${bounty.description || ''}`.toLowerCase();
  if (lowerText.includes('bountyfeedhq')) {
    return {
      viralScore: 100,
      rewardScore: 100,
      absurdityScore: 100,
      doabilityScore: 100,
      visualScore: 100,
      timingScore: 100,
      reasoning: "Self-promotion bounty to advertise BountyFeedHQ!",
    };
  }

  // Try LLM scoring first if key is present
  if (process.env.GROQ_API_KEY) {
    const llmScores = await scoreBountyWithLLM(bounty);
    if (llmScores) {
      return {
        viralScore: Math.min(100, llmScores.viralScore || 0),
        rewardScore: llmScores.rewardScore || 0,
        absurdityScore: llmScores.absurdityScore || 0,
        doabilityScore: llmScores.doabilityScore || 0,
        visualScore: llmScores.visualScore || 0,
        timingScore: llmScores.timingScore || 0,
        reasoning: llmScores.reasoning || '',
      };
    }
  }

  const title = bounty.title || '';
  const description = bounty.description || '';
  const rewardAmount = bounty.reward_amount || bounty.rewardAmount || 0;
  const rewardUsd = bounty.reward_usd || bounty.rewardUsd || 0;
  const currency = bounty.reward_currency || bounty.rewardCurrency || 'SOL';

  // Calculate reward score using USD value directly
  const rewardScore = calcRewardScore(rewardAmount, rewardUsd);
  const absurdityScore = calcAbsurdityScore(title, description);
  const doabilityScore = calcDoabilityScore(title, description, rewardAmount);
  const visualScore = calcVisualScore(title, description);
  const timingScore = calcTimingScore(bounty);

  const viralScore = Math.round(
    rewardScore * WEIGHTS.reward +
    absurdityScore * WEIGHTS.absurdity +
    doabilityScore * WEIGHTS.doability +
    visualScore * WEIGHTS.visual +
    timingScore * WEIGHTS.timing
  );

  return {
    viralScore: Math.min(100, viralScore),
    rewardScore,
    absurdityScore,
    doabilityScore,
    visualScore,
    timingScore,
  };
}

/**
 * Categorize a bounty based on its scores and content.
 * Returns a category string used for template selection.
 */
export function categorizeBounty(bounty, scores) {
  const title = (bounty.title || '').toLowerCase();
  const description = (bounty.description || '').toLowerCase();
  const text = `${title} ${description}`;
  const rewardAmount = bounty.reward_amount || bounty.rewardAmount || 0;

  // Check for completed/successful submission
  if (bounty.status === 'completed' || bounty.status === 'claimed') {
    return 'completed';
  }

  // Big bounty
  if (rewardAmount >= 10) {
    return 'big_bounty';
  }

  // Extreme/wild
  if (scores.absurdityScore >= 60) {
    return 'extreme';
  }

  // Easy money
  if (scores.doabilityScore >= 80 && scores.absurdityScore < 30) {
    return 'easy_money';
  }

  // Funny
  if (scores.absurdityScore >= 30) {
    return 'funny';
  }

  // Default
  return 'general';
}

/**
 * Generate a human-readable score summary.
 */
export function formatScoreSummary(scores) {
  const bars = (val) => {
    const filled = Math.round(val / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  };

  return [
    `🏆 Viral Score: ${scores.viralScore}/100`,
    `💰 Reward:    ${bars(scores.rewardScore)} ${scores.rewardScore}`,
    `🤪 Absurdity: ${bars(scores.absurdityScore)} ${scores.absurdityScore}`,
    `✅ Doability: ${bars(scores.doabilityScore)} ${scores.doabilityScore}`,
    `📸 Visual:    ${bars(scores.visualScore)} ${scores.visualScore}`,
    `⏰ Timing:    ${bars(scores.timingScore)} ${scores.timingScore}`,
  ].join('\n');
}

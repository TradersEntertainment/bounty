/**
 * Tweet templates for BountyFeedHQ.
 * Uses crypto/degen culture language, emojis, and humor.
 */

// ─── Template Pools ──────────────────────────────────────────────────

const TEMPLATES = {
  funny: [
    (b) => `💀 someone is paying ${b.reward} SOL for:

"${b.title}"

i love this timeline

#PumpFunGO #Solana`,

    (b) => `bro what 😭😭😭

"${b.title}" — ${b.reward} SOL

the internet remains undefeated

#PumpFunGO #Solana`,

    (b) => `"${b.title}"

${b.reward} SOL. dead serious. 💀

this is why i wake up every morning

#PumpFunGO #Solana`,

    (b) => `i need everyone to stop what they're doing rn

someone just put up ${b.reward} SOL for:
"${b.title}"

😭😭😭

#PumpFunGO #Solana`,

    (b) => `the bounties keep getting crazier

"${b.title}" — ${b.reward} SOL 💀

who's doing it?

#PumpFunGO #Solana`,
  ],

  big_bounty: [
    (b) => `${b.reward} SOL bounty just dropped 🚨

"${b.title}"

that's real money. who wants it?

#PumpFunGO #Solana`,

    (b) => `somebody really put up ${b.reward} SOL for this:

"${b.title}"

massive bag sitting right there 💰

#PumpFunGO #Solana`,

    (b) => `"${b.title}"

💰 ${b.reward} SOL reward

this is not a joke. someone go claim this bag

#PumpFunGO #Solana`,

    (b) => `${b.reward} SOL on the table 👀

"${b.title}"

are you really gonna let someone else take this?

#PumpFunGO #Solana`,

    (b) => `we don't talk enough about the bags on @PumpFunGO

"${b.title}" — ${b.reward} SOL

someone go get this 🏃‍♂️

#PumpFunGO #Solana`,
  ],

  extreme: [
    (b) => `"${b.title}"

${b.reward} SOL if you actually do it

who's unhinged enough? 🤯

#PumpFunGO #Solana`,

    (b) => `this might be the most insane bounty i've ever seen

"${b.title}" — ${b.reward} SOL 💀

tag someone who'd actually do this

#PumpFunGO #Solana`,

    (b) => `${b.reward} SOL to "${b.title}"

i— 😭

@PumpFunGO is different

#PumpFunGO #Solana`,

    (b) => `"${b.title}"

reward: ${b.reward} SOL

this is absolutely unhinged and i'm here for it 🍿

#PumpFunGO #Solana`,

    (b) => `every day @PumpFunGO gets wilder

"${b.title}" for ${b.reward} SOL

what timeline is this 💀

#PumpFunGO #Solana`,
  ],

  completed: [
    (b) => `someone actually did it ✅

"${b.title}" — ${b.reward} SOL claimed

absolute legend 🫡

#PumpFunGO #Solana`,

    (b) => `THE MADLAD DID IT 😭

"${b.title}" — COMPLETED

${b.reward} SOL secured 💰

#PumpFunGO #Solana`,

    (b) => `bag claimed ✅

"${b.title}" — ${b.reward} SOL paid out

never doubt a degen on a mission

#PumpFunGO #Solana`,
  ],

  easy_money: [
    (b) => `this one's basically free money:

"${b.title}" — ${b.reward} SOL

what are you waiting for? 🏃‍♂️

#PumpFunGO #Solana`,

    (b) => `easiest ${b.reward} SOL of your life:

"${b.title}"

go get that bread 🍞

#PumpFunGO #Solana`,

    (b) => `if you're not checking @PumpFunGO you're leaving SOL on the table

"${b.title}" — ${b.reward} SOL

this is free money anon 👀

#PumpFunGO #Solana`,
  ],

  general: [
    (b) => `new bounty 👀

"${b.title}" — ${b.reward} SOL

#PumpFunGO #Solana`,

    (b) => `"${b.title}"

${b.reward} SOL reward on @PumpFunGO

who's on it?

#PumpFunGO #Solana`,

    (b) => `${b.reward} SOL bounty live rn:

"${b.title}"

#PumpFunGO #Solana`,
  ],

  daily_recap: [
    (data) => `📊 BountyFeedHQ Daily Recap 📊

🔥 ${data.totalBounties} new bounties today
💰 Biggest reward: ${data.biggestReward}
🤪 Most absurd: "${data.mostAbsurd}"
📈 Avg viral score: ${data.avgScore}/100

@PumpFunGO never sleeps 🫡

#PumpFunGO #Solana #DailyRecap`,

    (data) => `gm degens ☀️ here's your daily @PumpFunGO roundup:

📌 ${data.totalBounties} bounties tracked
💰 Top reward: ${data.biggestReward}
🏆 Most viral: "${data.mostAbsurd}"

another day in the degen economy 📈

#PumpFunGO #Solana #Crypto`,
  ],
};

// ─── Template Selection ──────────────────────────────────────────────

/**
 * Pick a random template from a category.
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a tweet for a bounty using the appropriate template category.
 *
 * @param {Object} bounty - The bounty object from the database
 * @param {string} category - Template category (funny, big_bounty, extreme, completed, easy_money, general)
 * @returns {{ text: string, templateUsed: string }}
 */
export function generateTweet(bounty, category = 'general') {
  const templates = TEMPLATES[category] || TEMPLATES.general;
  const template = pickRandom(templates);
  const templateIndex = templates.indexOf(template);
  
  const rewardAmount = bounty.reward_amount || bounty.rewardAmount || 0;
  const rewardUsd = bounty.reward_usd || bounty.rewardUsd || 0;
  const currency = bounty.reward_currency || bounty.rewardCurrency || 'SOL';

  let rewardText = formatReward(rewardAmount);
  if (rewardUsd > 0) {
    rewardText = `${rewardText} (~$${Math.round(rewardUsd).toLocaleString()})`;
  }

  // Build template data
  const data = {
    title: truncateTitle(bounty.title || 'Untitled Bounty', 80),
    reward: rewardText,
    creator: bounty.creator || 'anon',
    submissions: bounty.submission_count || bounty.submissionCount || 0,
    url: bounty.source_url || bounty.sourceUrl || 'https://pump.fun/go/bounties',
    deadline: bounty.deadline || '',
  };
  
  const text = template(data);
  
  // Ensure tweet is within 280 character limit
  let finalText = enforceCharLimit(text);

  // If currency is not SOL, replace all occurrences of "SOL" in the final text with the token currency name
  if (currency !== 'SOL') {
    finalText = finalText.replace(/\bSOL\b/g, currency);
  }
  
  return {
    text: finalText,
    templateUsed: `${category}_${templateIndex}`,
  };
}
 
/**
 * Generate a daily recap tweet.
 */
export function generateRecapTweet(recapData) {
  const templates = TEMPLATES.daily_recap;
  const template = pickRandom(templates);
 
  const rewardSol = recapData.biggestReward || 0;
  const rewardUsd = recapData.biggestRewardUsd || 0;
  let rewardText = formatReward(rewardSol);
  if (rewardUsd > 0) {
    rewardText = `${rewardText} SOL (~$${Math.round(rewardUsd).toLocaleString()})`;
  } else {
    rewardText = `${rewardText} SOL`;
  }

  const data = {
    totalBounties: recapData.totalBounties || 0,
    biggestReward: rewardText,
    mostAbsurd: truncateTitle(recapData.mostAbsurd || 'N/A', 50),
    avgScore: Math.round(recapData.avgScore || 0),
  };
 
  return {
    text: enforceCharLimit(template(data)),
    templateUsed: 'daily_recap',
  };
}
 
/**
 * Generate a thread (multiple tweets) for a particularly viral bounty.
 */
export function generateThread(bounty, scores) {
  const rewardAmount = bounty.reward_amount || bounty.rewardAmount || 0;
  const rewardUsd = bounty.reward_usd || bounty.rewardUsd || 0;
  const currency = bounty.reward_currency || bounty.rewardCurrency || 'SOL';

  let rewardText = formatReward(rewardAmount);
  if (rewardUsd > 0) {
    rewardText = `${rewardText} (~$${Math.round(rewardUsd).toLocaleString()})`;
  }

  const data = {
    title: truncateTitle(bounty.title || 'Untitled Bounty', 80),
    reward: rewardText,
    url: bounty.source_url || bounty.sourceUrl || 'https://pump.fun/go/bounties',
  };

  const thread = [
    // Tweet 1: Hook
    `🧵 THREAD: The most unhinged bounty on @PumpFunGO right now

"${data.title}"

${data.reward} SOL reward 💰

Let me break down why this is absolutely wild 👇`,

    // Tweet 2: The details
    `What they're asking for:

"${truncateTitle(bounty.description || bounty.title || '', 150)}"

Viral Score: ${scores.viralScore}/100 🔥
Absurdity Level: ${scores.absurdityScore >= 60 ? 'OFF THE CHARTS' : scores.absurdityScore >= 30 ? 'Pretty wild' : 'Moderate'} 🤪`,

    // Tweet 3: CTA
    `Think you can do it?

Check out this bounty and claim that bag: ${data.url}

@PumpFunGO is where degens become legends 🫡

#PumpFunGO #Solana #Bounty #Crypto`,
  ];

  const result = thread.map(t => enforceCharLimit(t));
  if (currency !== 'SOL') {
    return result.map(t => t.replace(/\bSOL\b/g, currency));
  }
  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Truncate title to a max length, adding ellipsis if needed.
 */
function truncateTitle(title, maxLength) {
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 3).trim() + '...';
}

/**
 * Format reward amount nicely.
 */
function formatReward(amount) {
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  if (amount >= 1) return amount.toFixed(1);
  if (amount >= 0.01) return amount.toFixed(2);
  return amount.toString();
}

/**
 * Enforce Twitter's 280 character limit.
 * URLs count as 23 characters on Twitter.
 */
function enforceCharLimit(text, limit = 280) {
  // Twitter counts URLs as 23 chars each
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlRegex) || [];
  let adjustedLength = text.length;

  for (const url of urls) {
    adjustedLength -= url.length;
    adjustedLength += 23; // Twitter's t.co length
  }

  if (adjustedLength <= limit) return text;

  // If over limit, try to trim the tweet text (not URLs or hashtags)
  // Simple approach: remove hashtags if needed
  const lines = text.split('\n');
  while (adjustedLength > limit && lines.length > 1) {
    const removed = lines.pop();
    if (removed.startsWith('#')) {
      adjustedLength -= removed.length + 1;
    } else {
      lines.push(removed); // Don't remove non-hashtag lines
      break;
    }
  }

  return lines.join('\n');
}

/**
 * Get all available template categories.
 */
export function getTemplateCategories() {
  return Object.keys(TEMPLATES);
}

/**
 * Get template count per category.
 */
export function getTemplateStats() {
  const stats = {};
  for (const [category, templates] of Object.entries(TEMPLATES)) {
    stats[category] = templates.length;
  }
  return stats;
}

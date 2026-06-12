/**
 * Tweet templates for BountyFeedHQ.
 * Uses crypto/degen culture language, emojis, and humor.
 */

// ─── Template Pools ──────────────────────────────────────────────────

const TEMPLATES = {
  funny: [
    (b) => `💀 someone is paying ${b.reward} for:

"${b.title}"

i love this timeline

#PumpFunGO #Solana`,

    (b) => `bro what 😭😭😭

"${b.title}" — ${b.reward}

the internet remains undefeated

#PumpFunGO #Solana`,

    (b) => `"${b.title}"

${b.reward}. dead serious. 💀

this is why i wake up every morning

#PumpFunGO #Solana`,

    (b) => `i need everyone to stop what they're doing rn

someone just put up ${b.reward} for:
"${b.title}"

😭😭😭

#PumpFunGO #Solana`,

    (b) => `the bounties keep getting crazier

"${b.title}" — ${b.reward} 💀

who's doing it?

#PumpFunGO #Solana`,
  ],

  big_bounty: [
    (b) => `${b.reward} bounty just dropped 🚨

"${b.title}"

that's real money. who wants it?

#PumpFunGO #Solana`,

    (b) => `somebody really put up ${b.reward} for this:

"${b.title}"

massive bag sitting right there 💰

#PumpFunGO #Solana`,

    (b) => `"${b.title}"

💰 ${b.reward} reward

this is not a joke. someone go claim this bag

#PumpFunGO #Solana`,

    (b) => `${b.reward} on the table 👀

"${b.title}"

are you really gonna let someone else take this?

#PumpFunGO #Solana`,

    (b) => `we don't talk enough about the bags on @pumpfun go

"${b.title}" — ${b.reward}

someone go get this 🏃‍♂️

#PumpFunGO #Solana`,
  ],

  extreme: [
    (b) => `"${b.title}"

${b.reward} if you actually do it

who's unhinged enough? 🤯

#PumpFunGO #Solana`,

    (b) => `this might be the most insane bounty i've ever seen

"${b.title}" — ${b.reward} 💀

tag someone who'd actually do this

#PumpFunGO #Solana`,

    (b) => `${b.reward} to "${b.title}"

i— 😭

@pumpfun go is different

#PumpFunGO #Solana`,

    (b) => `"${b.title}"

reward: ${b.reward}

this is absolutely unhinged and i'm here for it 🍿

#PumpFunGO #Solana`,

    (b) => `every day @pumpfun go gets wilder

"${b.title}" for ${b.reward}

what timeline is this 💀

#PumpFunGO #Solana`,
  ],

  completed: [
    (b) => `someone actually did it ✅

"${b.title}" — ${b.reward} claimed

absolute legend 🫡

#PumpFunGO #Solana`,

    (b) => `THE MADLAD DID IT 😭

"${b.title}" — COMPLETED

${b.reward} secured 💰

#PumpFunGO #Solana`,

    (b) => `bag claimed ✅

"${b.title}" — ${b.reward} paid out

never doubt a degen on a mission

#PumpFunGO #Solana`,
  ],

  easy_money: [
    (b) => `this one's basically free money:

"${b.title}" — ${b.reward}

what are you waiting for? 🏃‍♂️

#PumpFunGO #Solana`,

    (b) => `easiest ${b.reward} of your life:

"${b.title}"

go get that bread 🍞

#PumpFunGO #Solana`,

    (b) => `if you're not checking @pumpfun go you're leaving money on the table

"${b.title}" — ${b.reward}

this is free money anon 👀

#PumpFunGO #Solana`,
  ],

  general: [
    (b) => `new bounty 👀

"${b.title}" — ${b.reward}

#PumpFunGO #Solana`,

    (b) => `"${b.title}"

${b.reward} reward on @pumpfun go

who's on it?

#PumpFunGO #Solana`,

    (b) => `${b.reward} bounty live rn:

"${b.title}"

#PumpFunGO #Solana`,
  ],

  daily_recap: [
    (data) => `📊 BountyFeedHQ Daily Recap 📊

🔥 ${data.totalBounties} new bounties today
💰 Biggest reward: ${data.biggestReward}
🤪 Most absurd: "${data.mostAbsurd}"
📈 Avg viral score: ${data.avgScore}/100

@pumpfun go never sleeps 🫡

#PumpFunGO #Solana #DailyRecap`,

    (data) => `today's @pumpfun go roundup is wild 🔥

📌 ${data.totalBounties} bounties tracked
💰 Top reward: ${data.biggestReward}
🏆 Most viral: "${data.mostAbsurd}"

another day in the degen economy 📈

#PumpFunGO #Solana #Crypto`,
  ],

  success_story: [
    (b) => `🏆 someone actually did it and earned ${b.reward}

proof is right here 👇

#PumpFunGO #Solana`,

    (b) => `this absolute legend just earned ${b.reward} 💰

pump.fun GO is paying people for real. 👀

#PumpFunGO #Solana`,

    (b) => `they said it couldn't be done 💀

${b.reward} — claimed ✅

#PumpFunGO #Solana`,

    (b) => `another bag secured 💰

${b.reward} earned on @pumpfun go

this is proof people are actually getting paid 🫡

#PumpFunGO #Solana`,

    (b) => `THE MADLAD ACTUALLY DID IT 😭

${b.reward} collected. just like that.

@pumpfun go hits different

#PumpFunGO #Solana`,

    (b) => `${b.reward} earned ✅

from a bounty we posted about 👆

degens stay winning on @pumpfun go

#PumpFunGO #Solana`,
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
 * Build a human-readable reward string from bounty data.
 * Uses USD as the primary display and appends token ticker.
 * Examples: "$23,469 in $SOL", "$15,279 in $MEMECOIN", "370 SOL"
 */
function buildRewardDisplay(bounty) {
  const rewardAmount = bounty.reward_amount || bounty.rewardAmount || 0;
  const rewardUsd = bounty.reward_usd || bounty.rewardUsd || 0;
  const currency = bounty.reward_currency || bounty.rewardCurrency || 'SOL';

  let tagTicker = currency;
  if (!tagTicker.startsWith('$')) {
    tagTicker = `$${tagTicker.toUpperCase()}`;
  }

  if (rewardUsd > 0) {
    return `$${Math.round(rewardUsd).toLocaleString('en-US')} in ${tagTicker}`;
  }

  // Fallback: use raw amount with currency
  return `${formatReward(rewardAmount)} ${currency}`;
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

  const rewardDisplay = buildRewardDisplay(bounty);

  // Build template data
  const data = {
    title: truncateTitle(bounty.title || 'Untitled Bounty', 80),
    reward: rewardDisplay,
    creator: bounty.creator || 'anon',
    submissions: bounty.submission_count || bounty.submissionCount || 0,
    url: bounty.source_url || bounty.sourceUrl || 'https://pump.fun/go/bounties',
    deadline: bounty.deadline || '',
  };
  
  let text = template(data);
  
  // Ensure tweet is within 280 character limit
  let finalText = enforceCharLimit(text);

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
 
  const rewardUsd = recapData.biggestRewardUsd || 0;
  let rewardText = '';
  if (rewardUsd > 0) {
    rewardText = `$${Math.round(rewardUsd).toLocaleString('en-US')}`;
  } else {
    const rewardSol = recapData.biggestReward || 0;
    rewardText = `${formatReward(rewardSol)} SOL`;
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
 * 2nd tweet contains actual deliverables and task details.
 */
export function generateThread(bounty, scores) {
  const rewardDisplay = buildRewardDisplay(bounty);

  const data = {
    title: truncateTitle(bounty.title || 'Untitled Bounty', 80),
    reward: rewardDisplay,
    url: bounty.source_url || bounty.sourceUrl || 'https://pump.fun/go/bounties',
    description: bounty.description || bounty.title || '',
  };

  // Varied hook openers for tweet 1
  const hooks = [
    `🚨 ${data.reward} bounty just dropped on @pumpfun go

"${data.title}"

this is actually insane 👇`,

    `okay which one of you is doing this for ${data.reward}? 💀

"${data.title}"

let me explain what they want 👇`,

    `no way someone is paying ${data.reward} for this 😭

"${data.title}"

here's what you gotta do 👇`,

    `${data.reward} sitting right there waiting to be claimed 💰

"${data.title}"

breaking down the requirements 👇`,

    `this might be the wildest bounty i've seen today

"${data.title}" — ${data.reward}

let me tell you what's needed 👇`,
  ];

  const hook = hooks[Math.floor(Math.random() * hooks.length)];

  // Tweet 2: Actual deliverables and task details
  const descText = truncateTitle(data.description, 180);
  const tweet2 = `📋 what's needed:

"${descText}"

${data.reward} on the line. dead serious. 💰

#PumpFunGO`;

  // Tweet 3: CTA with link
  const tweet3 = `want to claim it?

check it out here: ${data.url}

@pumpfun go is where degens become legends 🫡

#PumpFunGO #Solana`;

  const thread = [hook, tweet2, tweet3];

  return thread.map(t => enforceCharLimit(t));
}

/**
 * Generate a success story tweet for a completed bounty.
 * This will be posted as a quote tweet referencing our original bounty tweet.
 *
 * @param {Object} bounty - The bounty object from the database
 * @param {Object} completion - The completion record with winner info
 * @returns {{ text: string, templateUsed: string }}
 */
export function generateSuccessStoryTweet(bounty, completion) {
  const templates = TEMPLATES.success_story;
  const template = pickRandom(templates);
  const templateIndex = templates.indexOf(template);

  const rewardDisplay = buildRewardDisplay(bounty);

  const data = {
    title: truncateTitle(bounty.title || 'Untitled Bounty', 80),
    reward: rewardDisplay,
    winner: completion.winner_username || 'a legend',
  };

  let text = template(data);
  let finalText = enforceCharLimit(text);

  return {
    text: finalText,
    templateUsed: `success_story_${templateIndex}`,
  };
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
  if (amount >= 1000000000) return `${(amount / 1000000000).toFixed(1)}B`;
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
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
  let effectiveLength = text.length;
  for (const url of urls) {
    effectiveLength -= url.length;
    effectiveLength += 23;
  }

  if (effectiveLength <= limit) return text;

  // Try to trim by shortening the title in quotes
  const titleMatch = text.match(/"([^"]+)"/);
  if (titleMatch) {
    const fullTitle = titleMatch[1];
    const excess = effectiveLength - limit;
    if (fullTitle.length > excess + 10) {
      const shortened = fullTitle.slice(0, fullTitle.length - excess - 5) + '...';
      return text.replace(`"${fullTitle}"`, `"${shortened}"`);
    }
  }

  // Last resort: truncate and add ellipsis
  return text.slice(0, limit - 3) + '...';
}

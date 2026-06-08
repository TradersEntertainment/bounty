/**
 * Tweet templates for BountyFeedHQ.
 * Uses crypto/degen culture language, emojis, and humor.
 */

// ─── Template Pools ──────────────────────────────────────────────────

const TEMPLATES = {
  funny: [
    (b) => `💀 Someone is really offering ${b.reward} SOL to "${b.title}"

I love this timeline. Absolute degen energy.

Who's brave enough? 👀

${b.url}
#PumpFunGO #Solana #Bounty`,

    (b) => `bro what 😭😭😭

"${b.title}" — ${b.reward} SOL bounty on @PumpFunGO

the internet is undefeated ser

${b.url}
#PumpFunGO #Crypto #Bounty`,

    (b) => `🚨 BOUNTY ALERT 🚨

"${b.title}"

Reward: ${b.reward} SOL 💰

This is the most degen thing I've seen today and it's not even close 😂

${b.url}
#PumpFunGO #Solana`,

    (b) => `anon really said: "${b.title}"

and they're paying ${b.reward} SOL for it 💀

i can't with this space sometimes lmaooo

${b.url}
#PumpFunGO #Bounty #Solana`,

    (b) => `New bounty just dropped and I'm DECEASED 💀

"${b.title}" — ${b.reward} SOL

we are so early on @PumpFunGO frfr

${b.url}
#PumpFunGO #Solana #Crypto`,
  ],

  big_bounty: [
    (b) => `🐋 WHALE BOUNTY ALERT 🐋

"${b.title}"

💰 ${b.reward} SOL reward

This is not a drill. Someone is throwing BAGS at this. Who's taking it?

${b.url}
#PumpFunGO #Solana #Bounty #Crypto`,

    (b) => `👀 ${b.reward} SOL bounty just hit @PumpFunGO

"${b.title}"

That's real money ser. Absolute madlad territory.

Are you built for this? 💪

${b.url}
#PumpFunGO #Solana`,

    (b) => `💰💰💰 ${b.reward} SOL BOUNTY 💰💰💰

"${b.title}"

Someone is making it RAIN on @PumpFunGO

This could be your bag anon 👀

${b.url}
#PumpFunGO #Solana #Crypto #Bounty`,

    (b) => `ser... ${b.reward} SOL to "${b.title}"??

I've seen people do worse for less 😂

This is the degen economy we were promised. WAGMI 🚀

${b.url}
#PumpFunGO #Solana #Bounty`,

    (b) => `New ATH for degen bounties 📈

"${b.title}" — ${b.reward} SOL

@PumpFunGO is literally printing opportunities

who's claiming this bag? 💰

${b.url}
#PumpFunGO #Solana`,
  ],

  extreme: [
    (b) => `⚠️ EXTREME BOUNTY ⚠️

"${b.title}"

Reward: ${b.reward} SOL

This is absolutely UNHINGED and I'm here for every second of it 🍿

${b.url}
#PumpFunGO #Solana #Bounty`,

    (b) => `ok so someone really put up ${b.reward} SOL for:

"${b.title}"

absolute madlad energy on @PumpFunGO rn 🤯

i need to see someone attempt this

${b.url}
#PumpFunGO #Solana`,

    (b) => `🔥 CERTIFIED DEGEN BOUNTY 🔥

"${b.title}" — ${b.reward} SOL

This has main character energy and I need content creators to deliver

${b.url}
#PumpFunGO #Solana #Bounty #Crypto`,

    (b) => `The absolute STATE of @PumpFunGO right now:

"${b.title}"

${b.reward} SOL if you actually do it 💀

who's unhinged enough? tag someone

${b.url}
#PumpFunGO #Solana`,

    (b) => `I'm sorry WHAT?? 😭

"${b.title}" for ${b.reward} SOL

@PumpFunGO continues to deliver the most chaotic content on Solana

${b.url}
#PumpFunGO #Bounty #Solana`,
  ],

  completed: [
    (b) => `✅ BOUNTY COMPLETED ✅

"${b.title}" — someone actually DID IT

They earned ${b.reward} SOL 💰

Absolute legend. This is why @PumpFunGO hits different 🫡

${b.url}
#PumpFunGO #Solana`,

    (b) => `THE MADLAD ACTUALLY DID IT 😭🫡

"${b.title}" — COMPLETED ✅

${b.reward} SOL secured. Bag claimed.

Never doubt a degen on a mission 💪

${b.url}
#PumpFunGO #Solana #Crypto`,

    (b) => `another day, another bounty claimed 💰

"${b.title}" — DONE ✅

${b.reward} SOL paid out on @PumpFunGO

ser really woke up and chose chaos 😂

${b.url}
#PumpFunGO #Solana`,

    (b) => `🏆 WINNER WINNER 🏆

Someone just claimed ${b.reward} SOL for:
"${b.title}"

@PumpFunGO really out here changing lives one bounty at a time 🚀

${b.url}
#PumpFunGO #Solana #Bounty`,
  ],

  easy_money: [
    (b) => `💸 FREE MONEY ALERT 💸

"${b.title}" — ${b.reward} SOL

This is literally free money ser. What are you waiting for? 🏃‍♂️

${b.url}
#PumpFunGO #Solana #Bounty`,

    (b) => `if you're not checking @PumpFunGO bounties daily you're literally leaving SOL on the table

"${b.title}" — ${b.reward} SOL

this one's basically free anon 👀

${b.url}
#PumpFunGO #Solana #Crypto`,

    (b) => `Easy ${b.reward} SOL on the table rn:

"${b.title}"

Some of these @PumpFunGO bounties are genuinely just free money 🤷‍♂️

${b.url}
#PumpFunGO #Solana #Bounty`,

    (b) => `gm to everyone except people who ignore easy bounties 🌅

"${b.title}" — ${b.reward} SOL on @PumpFunGO

go get that bread anon 🍞

${b.url}
#PumpFunGO #Solana`,
  ],

  general: [
    (b) => `New bounty on @PumpFunGO 👀

"${b.title}"

Reward: ${b.reward} SOL 💰

${b.url}
#PumpFunGO #Solana #Bounty`,

    (b) => `Fresh bounty alert 🚨

"${b.title}" — ${b.reward} SOL

Check it out on @PumpFunGO 🔥

${b.url}
#PumpFunGO #Solana`,

    (b) => `another day, another @PumpFunGO bounty worth looking at 👀

"${b.title}" — ${b.reward} SOL

${b.url}
#PumpFunGO #Solana #Bounty #Crypto`,

    (b) => `${b.reward} SOL bounty live on @PumpFunGO:

"${b.title}"

who's on it? 🏃‍♂️💨

${b.url}
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
 
  const rewardSol = bounty.reward_amount || bounty.rewardAmount || 0;
  const rewardUsd = bounty.reward_usd || bounty.rewardUsd || 0;
  let rewardText = formatReward(rewardSol);
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
  const finalText = enforceCharLimit(text);
 
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
  const rewardSol = bounty.reward_amount || bounty.rewardAmount || 0;
  const rewardUsd = bounty.reward_usd || bounty.rewardUsd || 0;
  let rewardText = formatReward(rewardSol);
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

  return thread.map(t => enforceCharLimit(t));
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

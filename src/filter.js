/**
 * Content safety filter for BountyFeedHQ.
 * Blocks bounties and tweets containing harmful, violent, illegal, or NSFW content.
 */

const BLOCKED_CATEGORIES = {
  violence: [
    'kill', 'murder', 'assault', 'weapon', 'gun', 'knife', 'fight', 'attack',
    'hurt', 'harm', 'shoot', 'stab', 'strangle', 'beat up', 'punch', 'bomb',
    'explode', 'torture', 'execute', 'slaughter', 'massacre', 'bloodshed',
    'decapitate', 'dismember', 'maim',
  ],
  self_harm: [
    'suicide', 'self-harm', 'self harm', 'cut myself', 'cut yourself',
    'overdose', 'die', 'kill myself', 'kill yourself', 'end my life',
    'end your life', 'jump off', 'hang myself', 'hang yourself',
    'slit wrist', 'bleed out',
  ],
  illegal: [
    'drugs', 'steal', 'rob', 'arson', 'vandalism', 'fraud', 'counterfeit',
    'launder', 'trafficking', 'smuggle', 'kidnap', 'extort', 'blackmail',
    'hack into', 'break into', 'trespass', 'forge', 'embezzle', 'bribe',
    'illegal substance', 'meth', 'cocaine', 'heroin', 'fentanyl',
  ],
  harassment: [
    'doxx', 'doxing', 'stalk', 'stalking', 'bully', 'bullying', 'threaten',
    'threatening', 'revenge porn', 'harass', 'harassment', 'intimidate',
    'swat', 'swatting', 'death threat', 'rape threat',
  ],
  nsfw: [
    'porn', 'pornography', 'explicit sex', 'sexual intercourse', 'genitals',
    'masturbat', 'orgasm', 'erotic', 'xxx', 'nude child', 'child porn',
    'pedophil', 'bestiality', 'incest', 'rape',
  ],
  minors: [
    'child abuse', 'minor', 'underage', 'child exploit', 'grooming',
  ],
};

// Compile all blocked keywords into a flat list with their categories
const BLOCKED_ENTRIES = [];
for (const [category, keywords] of Object.entries(BLOCKED_CATEGORIES)) {
  for (const keyword of keywords) {
    BLOCKED_ENTRIES.push({ keyword: keyword.toLowerCase(), category });
  }
}

/**
 * Add extra blocked keywords from environment config.
 */
function getExtraBlockedKeywords() {
  const extra = process.env.EXTRA_BLOCKED_KEYWORDS;
  if (!extra || extra.trim() === '') return [];
  return extra.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
}

/**
 * Check if text contains any blocked content.
 * Returns { blocked: boolean, reason: string, category: string, keyword: string }
 */
export function checkContent(text) {
  if (process.env.DISABLE_SAFETY_FILTER === 'true') {
    return { blocked: false, reason: null, category: null, keyword: null };
  }

  if (!text || typeof text !== 'string') {
    return { blocked: false, reason: null, category: null, keyword: null };
  }

  const lowerText = text.toLowerCase();

  // Check built-in blocked keywords
  for (const entry of BLOCKED_ENTRIES) {
    if (containsWord(lowerText, entry.keyword)) {
      return {
        blocked: true,
        reason: `Contains blocked ${entry.category} keyword: "${entry.keyword}"`,
        category: entry.category,
        keyword: entry.keyword,
      };
    }
  }

  // Check extra blocked keywords from env
  const extraKeywords = getExtraBlockedKeywords();
  for (const keyword of extraKeywords) {
    if (containsWord(lowerText, keyword)) {
      return {
        blocked: true,
        reason: `Contains custom blocked keyword: "${keyword}"`,
        category: 'custom',
        keyword,
      };
    }
  }

  return { blocked: false, reason: null, category: null, keyword: null };
}

/**
 * Check if text contains a word/phrase, using word boundary logic.
 * For multi-word phrases, uses simple includes.
 * For single words, checks word boundaries to avoid false positives
 * (e.g., "die" shouldn't match "studies").
 */
function containsWord(text, keyword) {
  if (keyword.includes(' ')) {
    // Multi-word phrase: simple includes check
    return text.includes(keyword);
  }

  // Single word: use word boundary regex
  // Escape regex special characters in the keyword
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
}

/**
 * Filter a bounty object. Returns { safe: boolean, reason: string }
 */
export function filterBounty(bounty) {
  // Check title
  const titleCheck = checkContent(bounty.title);
  if (titleCheck.blocked) {
    return { safe: false, reason: `Title: ${titleCheck.reason}` };
  }

  // Check description
  const descCheck = checkContent(bounty.description);
  if (descCheck.blocked) {
    return { safe: false, reason: `Description: ${descCheck.reason}` };
  }

  return { safe: true, reason: null };
}

/**
 * Filter a tweet text. Returns { safe: boolean, reason: string }
 */
export function filterTweet(tweetText) {
  return {
    safe: !checkContent(tweetText).blocked,
    reason: checkContent(tweetText).blocked ? checkContent(tweetText).reason : null,
  };
}

/**
 * Sanitize text by replacing blocked keywords with asterisks.
 * Useful for logging blocked content without repeating harmful words.
 */
export function sanitizeForLog(text) {
  if (!text) return '';
  let sanitized = text;

  for (const entry of BLOCKED_ENTRIES) {
    const escaped = entry.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    sanitized = sanitized.replace(regex, '*'.repeat(entry.keyword.length));
  }

  return sanitized;
}

/**
 * Get all blocked categories and their keyword counts.
 */
export function getFilterStats() {
  const stats = {};
  for (const [category, keywords] of Object.entries(BLOCKED_CATEGORIES)) {
    stats[category] = keywords.length;
  }
  stats.custom = getExtraBlockedKeywords().length;
  stats.total = BLOCKED_ENTRIES.length + stats.custom;
  return stats;
}

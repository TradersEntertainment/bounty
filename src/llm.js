/**
 * Groq LLM integration for BountyFeedHQ.
 * Uses Groq's fast inference API to score bounties and write custom tweets.
 */

import { createLogger } from './logger.js';

const log = createLogger('llm');

/**
 * Helper to call Groq Chat Completion API.
 */
let currentKeyIndex = 0;

function getApiKey() {
  const keysStr = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY;
  if (!keysStr) return null;
  
  const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return null;
  
  const idx = currentKeyIndex % keys.length;
  return { key: keys[idx], totalKeys: keys.length };
}

function rotateApiKey() {
  currentKeyIndex++;
}

async function callGroqAPI(messages, responseFormat = null, attempt = 1) {
  const keyInfo = getApiKey();
  if (!keyInfo) {
    return null;
  }

  const apiKey = keyInfo.key;
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  try {
    // Add a smaller delay if we have multiple keys to distribute load, otherwise 2s
    const delay = keyInfo.totalKeys > 1 ? 500 : 2000;
    await new Promise(resolve => setTimeout(resolve, delay));

    const body = {
      model,
      messages,
      temperature: 0.7,
    };

    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (response.status === 429) {
      log.warn(`Groq API Key index ${currentKeyIndex % keyInfo.totalKeys} rate limited (429).`);
      
      if (keyInfo.totalKeys > 1) {
        log.info('🔄 Rotating to the next Groq API key...');
        rotateApiKey();
        // Retry immediately with the next key, up to the number of available keys
        if (attempt < keyInfo.totalKeys) {
          return callGroqAPI(messages, responseFormat, attempt + 1);
        }
      } else {
        const retryAfter = 3000;
        log.warn(`Attempt ${attempt}/3. Waiting ${retryAfter}ms before retry...`);
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, retryAfter));
          return callGroqAPI(messages, responseFormat, attempt + 1);
        }
      }
    }

    if (!response.ok || data.error) {
      const errorMsg = data.error?.message || `HTTP ${response.status}`;
      log.error(`Groq API error: ${errorMsg}`);
      return null;
    }

    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    log.error(`Groq request failed: ${error.message}`);
    return null;
  }
}

/**
 * Score a bounty using LLM reasoning.
 * Returns scores on 5 dimensions and an analysis reasoning.
 *
 * @param {Object} bounty
 * @returns {Promise<Object|null>}
 */
export async function scoreBountyWithLLM(bounty) {
  const prompt = `You are the core brain of BountyFeedHQ, an automated curation bot that finds funny, absurd, or high-paying real-world tasks on pump.fun GO.
Analyze this bounty and assign scores (0 to 100) on 5 dimensions.

Bounty details:
Title: "${bounty.title}"
Description: "${bounty.description || 'No description provided.'}"
Reward: ${bounty.reward_amount || bounty.rewardAmount || 0} SOL

Dimensions to score:
1. rewardScore: Based on SOL reward (e.g. <0.1 SOL is low, >1 SOL is high, >10 SOL is extremely high).
2. absurdityScore: How crazy, funny, embarrassing, or shareable/absurd the task is (e.g. "shaving head in public" = 95, "doing homework" = 5).
3. doabilityScore: Can a human reasonably do it? (too easy like "follow X account" is boring = 40, impossible like "fly to Mars" = 10, perfectly doable and wild like "wear a funny costume to work" = 90).
4. visualScore: Would this produce highly engaging photo/video proof? (e.g., video stunts = 95, writing a tweet = 20).
5. timingScore: General freshness and viral potential (0-100).

Return ONLY a raw JSON object with this structure:
{
  "viralScore": <weighted_average_0_to_100>,
  "rewardScore": <number_0_to_100>,
  "absurdityScore": <number_0_to_100>,
  "doabilityScore": <number_0_to_100>,
  "visualScore": <number_0_to_100>,
  "timingScore": <number_0_to_100>,
  "reasoning": "A 1-sentence funny explanation of why this will go viral or why it's absurd."
}`;

  const responseText = await callGroqAPI(
    [
      { role: 'system', content: 'You only output raw JSON.' },
      { role: 'user', content: prompt }
    ],
    { type: 'json_object' }
  );

  if (!responseText) return null;

  try {
    const scores = JSON.parse(responseText);
    log.info(`LLM Scored "${bounty.title}" -> Viral: ${scores.viralScore}, Absurdity: ${scores.absurdityScore}`);
    return scores;
  } catch (e) {
    log.error(`Failed to parse LLM scores JSON: ${e.message}`);
    return null;
  }
}

/**
 * Generate a custom, high-viral potential tweet/thread using LLM.
 *
 * @param {Object} bounty
 * @param {Object} scores
 * @returns {Promise<{ text: string, type: 'single'|'thread' }|null>}
 */
export async function generateTweetWithLLM(bounty, scores) {
  const prompt = `You are a professional degen copywriter running @BountyFeedHQ.
Your job is to write an engaging, hilarious, and viral tweet about a real-world task/bounty on pump.fun GO.

Bounty details:
Title: "${bounty.title}"
Description: "${bounty.description || 'No description.'}"
Reward: ${bounty.reward_amount || bounty.rewardAmount || 0} SOL
Url: ${bounty.source_url || 'https://pump.fun/go/bounties'}

Curation Scores:
- Viral Potential: ${scores.viralScore}/100
- Absurdity Scale: ${scores.absurdityScore}/100
- LLM Reasoning: "${scores.reasoning || ''}"

Instructions:
1. Write in a funny, slightly sarcastic, and engaging crypto/degen culture tone (use lowercase, degen slang like "anon", "ser", "gm", emojis like 💀, 😂, 👀, 🚨).
2. Highlight why this is hilarious, absurd, or a massive bag (huge SOL reward).
3. If the viral score is very high (>= 80), you can write a short 2-3 tweet thread. Otherwise, write a single tweet.
4. Keep the single tweet or individual thread parts under 280 characters.
5. Always include the bounty URL (${bounty.source_url || 'https://pump.fun/go/bounties'}).
6. Include relevant hashtags like #PumpFunGO, #Solana, #Bounty.

Return ONLY a raw JSON object with this structure:
{
  "type": "single",
  "text": "Your tweet content here"
}
OR for threads:
{
  "type": "thread",
  "text": "First tweet content here\\n---THREAD_SEPARATOR---\\nSecond tweet content here"
}`;

  const responseText = await callGroqAPI([
    { role: 'system', content: 'You only output raw JSON.' },
    { role: 'user', content: prompt }
  ], { type: 'json_object' });

  if (!responseText) return null;

  try {
    const result = JSON.parse(responseText);
    log.info(`LLM Generated tweet type: ${result.type}`);
    return result;
  } catch (e) {
    log.error(`Failed to parse LLM tweet JSON: ${e.message}`);
    return null;
  }
}

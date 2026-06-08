/**
 * Telegram Channel Integration for BountyFeedHQ.
 * Handles posting curated bounties and daily recaps to a Telegram channel.
 */

import { createLogger } from './logger.js';

const log = createLogger('telegram');

/**
 * Send a message to the Telegram channel.
 *
 * @param {string} text - Message content
 * @returns {Promise<{ success: boolean, messageId: number, error: string }>}
 */
export async function sendTelegramMessage(text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const enabled = process.env.TELEGRAM_ENABLED === 'true';

  if (!enabled) {
    log.debug('Telegram posting is disabled. Skipping.');
    return { success: false, messageId: null, error: 'Telegram posting disabled' };
  }

  if (!botToken || !chatId) {
    log.warn('Telegram BOT_TOKEN or CHAT_ID not configured. Skipping post.');
    return { success: false, messageId: null, error: 'Telegram credentials not configured' };
  }

  try {
    // Replace Twitter handles with text if needed, or keep them as is
    let formattedText = text;

    // Send the message using Telegram Bot API
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: formattedText,
        disable_web_page_preview: false,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      const errorMsg = data.description || `HTTP ${response.status}`;
      log.error(`Telegram API error: ${errorMsg}`);
      return { success: false, messageId: null, error: errorMsg };
    }

    log.info(`Telegram message posted successfully: ${data.result.message_id}`);
    return {
      success: true,
      messageId: data.result.message_id,
      error: null,
    };
  } catch (error) {
    log.error(`Failed to send Telegram message: ${error.message}`);
    return {
      success: false,
      messageId: null,
      error: error.message,
    };
  }
}

/**
 * Simple structured logger for BountyFeedHQ.
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel() {
  const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LOG_LEVELS[envLevel] ?? LOG_LEVELS.info;
}

const COLORS = {
  debug: '\x1b[90m',   // gray
  info: '\x1b[36m',    // cyan
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red
  reset: '\x1b[0m',
};

const ICONS = {
  debug: '🔍',
  info: 'ℹ️ ',
  warn: '⚠️ ',
  error: '❌',
};

/**
 * Create a logger with a specific module name prefix.
 */
export function createLogger(moduleName) {
  function logMessage(level, ...args) {
    const configLevel = getConfiguredLevel();
    if (LOG_LEVELS[level] < configLevel) return;

    const timestamp = new Date().toISOString().slice(11, 19);
    const color = COLORS[level] || COLORS.reset;
    const icon = ICONS[level] || '';
    const prefix = `${color}[${timestamp}] ${icon} [${moduleName}]${COLORS.reset}`;

    if (level === 'error') {
      console.error(prefix, ...args);
    } else if (level === 'warn') {
      console.warn(prefix, ...args);
    } else {
      console.log(prefix, ...args);
    }
  }

  return {
    debug: (...args) => logMessage('debug', ...args),
    info: (...args) => logMessage('info', ...args),
    warn: (...args) => logMessage('warn', ...args),
    error: (...args) => logMessage('error', ...args),
  };
}

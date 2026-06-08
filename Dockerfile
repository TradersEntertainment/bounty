# BountyFeedHQ — Docker image for Railway deployment
FROM node:20-slim

# Install system dependencies for Playwright Chromium
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libnspr4 \
    libx11-xcb1 \
    fonts-liberation \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json ./

# Install Node dependencies
RUN npm install --production

# Install Playwright Chromium browser
RUN npx playwright install chromium

# Copy source code
COPY . .

# Create data directory for SQLite
RUN mkdir -p data

# Set environment
ENV NODE_ENV=production
ENV BROWSER_HEADLESS=true

# Start the cron scheduler with auto-posting
CMD ["node", "src/index.js", "cron", "--auto"]

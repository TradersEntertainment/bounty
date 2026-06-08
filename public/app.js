/**
 * BountyFeedHQ Web Frontend Application Script
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    let bounties = [];
    let activeFilter = 'all';

    // Elements
    const gridEl = document.getElementById('bounties-grid');
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    // Stats Elements
    const statTotalScraped = document.getElementById('stat-total-scraped');
    const statTotalPosted = document.getElementById('stat-total-posted');
    const statTodayScraped = document.getElementById('stat-today-scraped');
    const statHighestReward = document.getElementById('stat-highest-reward');

    // Initialize API calls
    fetchStats();
    fetchBounties();

    // Setup filter listeners
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            renderBounties();
        });
    });

    /**
     * Fetch Daily and Overall Stats from API
     */
    async function fetchStats() {
        try {
            const res = await fetch('/api/stats');
            if (!res.ok) throw new Error('Stats API failed');
            const data = await res.json();

            // Animate counters
            animateCounter(statTotalScraped, data.totalBounties || 0);
            animateCounter(statTotalPosted, data.totalPosted || 0);
            animateCounter(statTodayScraped, data.today.bountiesScraped || 0);
            
            // Format reward value
            const maxReward = data.today.highestReward || 0;
            statHighestReward.textContent = maxReward > 0 ? `${maxReward} SOL` : '0 SOL';
        } catch (error) {
            console.error('Failed to load stats:', error);
            // Fallbacks
            statTotalScraped.textContent = 'N/A';
            statTotalPosted.textContent = 'N/A';
            statTodayScraped.textContent = 'N/A';
            statHighestReward.textContent = 'N/A';
        }
    }

    /**
     * Fetch Curation Bounties List from API
     */
    async function fetchBounties() {
        try {
            const res = await fetch('/api/bounties');
            if (!res.ok) throw new Error('Bounties API failed');
            bounties = await res.json();
            renderBounties();
        } catch (error) {
            console.error('Failed to load bounties:', error);
            gridEl.innerHTML = `
                <div class="glass-panel error-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; color: var(--color-viral); margin-bottom: 1rem;"></i>
                    <h3>Failed to Load Curation Feed</h3>
                    <p style="color: var(--text-secondary); margin-top: 0.5rem;">The server could not retrieve database records at this moment. Please refresh the page.</p>
                </div>
            `;
        }
    }

    /**
     * Render the filtered list of bounties to grid
     */
    function renderBounties() {
        if (bounties.length === 0) {
            gridEl.innerHTML = `
                <div class="glass-panel empty-state" style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem;">
                    <i class="fa-solid fa-clipboard-question" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 1.25rem;"></i>
                    <h3>No Bounties Curated Yet</h3>
                    <p style="color: var(--text-secondary); margin-top: 0.5rem; max-width: 400px; margin-left: auto; margin-right: auto;">
                        The automation agent has not populated any records yet. Once a scan cycle completes, the feed will display here.
                    </p>
                </div>
            `;
            return;
        }

        // Apply filters
        const filtered = bounties.filter(b => {
            if (activeFilter === 'viral') {
                return (b.viral_score || 0) >= 60;
            }
            if (activeFilter === 'high-pay') {
                return (b.reward_amount || 0) >= 0.5;
            }
            if (activeFilter === 'posted') {
                return b.post_status === 'posted';
            }
            return true;
        });

        if (filtered.length === 0) {
            gridEl.innerHTML = `
                <div class="glass-panel empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                    <i class="fa-solid fa-filter-circle-xmark" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
                    <h3>No Results Found</h3>
                    <p style="color: var(--text-secondary); margin-top: 0.5rem;">No bounties match your selected filter criteria.</p>
                </div>
            `;
            return;
        }

        // Render Cards
        gridEl.innerHTML = filtered.map(b => {
            // Determine badge status
            let badgeHtml = '';
            if (b.post_status === 'posted') {
                badgeHtml = `<span class="card-badge posted"><i class="fa-brands fa-x-twitter"></i> Broadcasted</span>`;
            } else if ((b.viral_score || 0) >= 60) {
                badgeHtml = `<span class="card-badge viral"><i class="fa-solid fa-fire"></i> Hot Draft</span>`;
            } else {
                badgeHtml = `<span class="card-badge standard">Scored</span>`;
            }

            // Submissions count badge
            const subsCount = b.submission_count || 0;
            const subsLabel = subsCount === 1 ? '1 Submission' : `${subsCount} Submissions`;

            // Setup viral score bar color
            const viralScore = Math.round(b.viral_score || 0);

            // Escape description HTML tags
            const escapedDesc = escapeHtml(b.description || 'No description available.');

            return `
                <article class="bounty-card">
                    ${badgeHtml}
                    <div class="card-header">
                        <div class="creator-info">
                            <img class="creator-avatar" src="${b.creator_avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + b.creator}" alt="Creator avatar" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=bfeed'">
                            <span class="creator-name">by @${escapeHtml(b.creator || 'anonymous')}</span>
                        </div>
                        <h3 class="card-title">${escapeHtml(b.title)}</h3>
                    </div>
                    <div class="card-body">
                        <p class="card-description">${escapedDesc}</p>
                        
                        <!-- Curation Scores -->
                        <div class="metric-row">
                            <div class="metric-label-row">
                                <span>Viral Potential</span>
                                <strong>${viralScore}/100</strong>
                            </div>
                            <div class="metric-bar-bg">
                                <div class="metric-bar-fill viral" style="width: ${viralScore}%"></div>
                            </div>
                        </div>

                        <div class="metric-row" style="margin-bottom: 0;">
                            <div class="metric-label-row">
                                <span>Absurdity Scale</span>
                                <strong>${Math.round(b.absurdity_score || 0)}/100</strong>
                            </div>
                            <div class="metric-bar-bg">
                                <div class="metric-bar-fill" style="width: ${Math.round(b.absurdity_score || 0)}%"></div>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer">
                        <div class="reward-info">
                            <span class="reward-label">Reward</span>
                            <span class="reward-value">${b.reward_amount} ${b.reward_currency || 'SOL'}</span>
                        </div>
                        <a href="${b.source_url || 'https://pump.fun/go/bounties'}" target="_blank" class="view-btn">
                            View Bounty <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem; margin-left: 0.25rem;"></i>
                        </a>
                    </div>
                </article>
            `;
        }).join('');
    }

    // --- Helpers ---
    function animateCounter(element, target) {
        if (target === 0) {
            element.textContent = '0';
            return;
        }
        let current = 0;
        const duration = 800; // ms
        const increment = Math.ceil(target / (duration / 16)); // 60 FPS
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                element.textContent = target.toLocaleString();
                clearInterval(timer);
            } else {
                element.textContent = current.toLocaleString();
            }
        }, 16);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});

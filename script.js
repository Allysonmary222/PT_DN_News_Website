// ==================== CONFIGURATION ====================
const CONFIG = {
    // Using a free CORS proxy to fetch RSS feeds
    CORS_PROXY: 'https://api.allorigins.win/raw?url=',
    REFRESH_INTERVAL: 300000, // 5 minutes
    MAX_ARTICLES: 30,
};

const RSS_FEEDS = {
    dn: {
        url: 'https://www.dn.pt/rss/ultimas/',
        name: 'Diário de Notícias',
        icon: '📰'
    },
    publico: {
        url: 'https://www.publico.pt/rss/ultimas',
        name: 'Público',
        icon: '📋'
    },
    expresso: {
        url: 'https://expresso.pt/rss',
        name: 'Expresso',
        icon: '📌'
    },
    sapo: {
        url: 'https://noticias.sapo.pt/rss/ultimas/',
        name: 'SAPO Notícias',
        icon: '🌐'
    },
    observador: {
        url: 'https://observador.pt/feed/',
        name: 'Observador',
        icon: '🔍'
    }
};

// ==================== STATE ====================
let allArticles = [];
let currentFilter = 'all';
let isFetching = false;

// ==================== DOM REFERENCES ====================
const newsGrid = document.getElementById('newsGrid');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const noResults = document.getElementById('noResults');
const refreshBtn = document.getElementById('refreshBtn');
const lastUpdate = document.getElementById('lastUpdate');
const sourceTags = document.querySelectorAll('.source-tag');

// ==================== RSS PARSER ====================
function parseRSS(xmlText, sourceKey) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    // Check for parsing errors
    if (xmlDoc.querySelector('parsererror')) {
        throw new Error('Invalid RSS feed');
    }

    const items = xmlDoc.querySelectorAll('item');
    const articles = [];

    items.forEach(item => {
        const title = item.querySelector('title')?.textContent || 'Sem título';
        const link = item.querySelector('link')?.textContent || '#';
        const description = item.querySelector('description')?.textContent || '';
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        const creator = item.querySelector('creator')?.textContent || '';
        
        // Clean description (remove HTML)
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = description;
        const cleanSummary = tempDiv.textContent || tempDiv.innerText || '';
        const summary = cleanSummary.length > 300 ? cleanSummary.slice(0, 300) + '...' : cleanSummary;

        articles.push({
            id: link + Date.now(), // Unique ID
            title: title,
            link: link,
            summary: summary,
            published: pubDate,
            author: creator,
            source: RSS_FEEDS[sourceKey].name,
            icon: RSS_FEEDS[sourceKey].icon,
            sourceKey: sourceKey
        });
    });

    return articles;
}

// ==================== FETCH NEWS ====================
async function fetchFeed(sourceKey) {
    const feed = RSS_FEEDS[sourceKey];
    const url = CONFIG.CORS_PROXY + encodeURIComponent(feed.url);
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const xmlText = await response.text();
        return parseRSS(xmlText, sourceKey);
    } catch (error) {
        console.error(`Error fetching ${feed.name}:`, error);
        return [];
    }
}

async function fetchAllNews() {
    if (isFetching) return;
    
    isFetching = true;
    refreshBtn.classList.add('spinning');
    refreshBtn.disabled = true;
    
    // Show loading
    loading.classList.remove('hidden');
    newsGrid.innerHTML = '';
    errorMessage.classList.add('hidden');
    noResults.classList.add('hidden');

    try {
        const feedPromises = Object.keys(RSS_FEEDS).map(key => fetchFeed(key));
        const results = await Promise.all(feedPromises);
        
        // Flatten and deduplicate by link
        const allArticlesFlat = results.flat();
        const seen = new Set();
        allArticles = allArticlesFlat.filter(article => {
            if (seen.has(article.link)) return false;
            seen.add(article.link);
            return true;
        });

        // Sort by date (newest first)
        allArticles.sort((a, b) => {
            return new Date(b.published) - new Date(a.published);
        });

        // Limit articles
        if (allArticles.length > CONFIG.MAX_ARTICLES) {
            allArticles = allArticles.slice(0, CONFIG.MAX_ARTICLES);
        }

        // Update last update time
        const now = new Date();
        lastUpdate.textContent = `Última atualização: ${now.toLocaleTimeString('pt-PT')}`;

        // Render articles
        renderArticles();

    } catch (error) {
        console.error('Error fetching news:', error);
        errorMessage.classList.remove('hidden');
        errorMessage.querySelector('p').textContent = 'Erro ao carregar notícias. Por favor, tente novamente.';
    } finally {
        loading.classList.add('hidden');
        isFetching = false;
        refreshBtn.classList.remove('spinning');
        refreshBtn.disabled = false;
    }
}

// ==================== RENDER ARTICLES ====================
function renderArticles() {
    const filtered = currentFilter === 'all' 
        ? allArticles 
        : allArticles.filter(a => a.sourceKey === currentFilter);

    if (filtered.length === 0) {
        newsGrid.innerHTML = '';
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    
    // Build HTML
    newsGrid.innerHTML = filtered.map(article => `
        <div class="news-card" data-source="${article.sourceKey}">
            <div class="news-card-header">
                <span class="news-source-icon">${article.icon}</span>
                <span class="news-source-name">${article.source}</span>
                <span class="news-date">${formatDate(article.published)}</span>
            </div>
            <div class="news-card-body">
                <h2 class="news-title">${escapeHtml(article.title)}</h2>
                <p class="news-summary">${escapeHtml(article.summary)}</p>
            </div>
            <div class="news-card-footer">
                <a href="${article.link}" target="_blank" rel="noopener noreferrer" class="news-link">
                    Ler notícia completa
                </a>
            </div>
        </div>
    `).join('');
}

// ==================== UTILITY FUNCTIONS ====================
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        if (isNaN(date)) return 'Data desconhecida';
        
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Agora mesmo';
        if (diffMins < 60) return `${diffMins}m atrás`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h atrás`;
        return date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
    } catch {
        return 'Data desconhecida';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== FILTER HANDLING ====================
function setFilter(sourceKey) {
    currentFilter = sourceKey;
    
    // Update active tag
    sourceTags.forEach(tag => {
        tag.classList.toggle('active', tag.dataset.source === sourceKey);
    });
    
    renderArticles();
}

// ==================== EVENT LISTENERS ====================
// Source tags click
sourceTags.forEach(tag => {
    tag.addEventListener('click', () => {
        setFilter(tag.dataset.source);
    });
});

// Refresh button
refreshBtn.addEventListener('click', fetchAllNews);

// Auto-refresh every 5 minutes
setInterval(() => {
    fetchAllNews();
}, CONFIG.REFRESH_INTERVAL);

// ==================== INITIALIZATION ====================
// Load news on page load
document.addEventListener('DOMContentLoaded', () => {
    fetchAllNews();
});

// Handle offline/online status
window.addEventListener('online', () => {
    console.log('Back online, refreshing news...');
    fetchAllNews();
});

window.addEventListener('offline', () => {
    console.warn('Offline - showing cached news');
});

console.log('🇵🇹 PT DN News loaded successfully!');
console.log(`📰 ${Object.keys(RSS_FEEDS).length} news sources configured`);

/* =========================================================
   Quantum Vendor Tracker — App Logic
   ========================================================= */

const state = {
  vendors: [],
  i18n: {},
  physicsDetails: {},
  lang: localStorage.getItem('qvt-lang') || 'en',
  theme: localStorage.getItem('qvt-theme') || 'dark',
  view: localStorage.getItem('qvt-view') || 'card',
  filters: { physics: new Set(), stack: new Set(), region: new Set(), trading: new Set(), era: new Set() },
  search: '',
  sort: 'name',
  lastUpdated: '',
  stockPrices: {}, // ticker -> {price, pct, error}
  modalPhysicsKey: null,  // currently-open physics modal key
  bloch: null,            // active BlochSphere instance, or null
};

const PHYSICS_OPTIONS = ['superconducting','iontrap','photonic','neutralatom','topological','siliconspin','nvcenter','agnostic'];
const STACK_OPTIONS   = ['full','qubit','control','software','cloud'];
const REGION_OPTIONS  = ['usa','europe','asia','canada'];
const TRADING_OPTIONS = ['public','private'];
const ERA_OPTIONS     = ['legacy','modern','recent'];

// Derive bucket keys from vendor properties for filters that aren't direct fields.
function eraOf(vendor) {
  if (vendor.founded <= 2009) return 'legacy';
  if (vendor.founded <= 2017) return 'modern';
  return 'recent';
}
function tradingOf(vendor) {
  return vendor.ticker ? 'public' : 'private';
}

/* ---------- Boot ---------- */
async function boot() {
  applyTheme();
  applyView();

  try {
    // Cache-bust by day so daily updates to vendors.json are picked up immediately,
    // but cache within the same day so repeat visits are fast.
    const day = new Date().toISOString().slice(0, 10);
    const [v, i, p] = await Promise.all([
      fetch(`vendors.json?d=${day}`).then(r => r.json()),
      fetch(`i18n.json?d=${day}`).then(r => r.json()),
      fetch(`physics-details.json?d=${day}`).then(r => r.json()).catch(() => ({})),
    ]);
    state.vendors = v.vendors;
    state.lastUpdated = v.lastUpdated;
    state.i18n = i;
    state.physicsDetails = p;
  } catch (e) {
    console.error('Failed to load data:', e);
    document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#fff">Failed to load data. If you opened the file directly, please serve via a local web server (see README).</div>';
    return;
  }

  buildFilters();
  bindEvents();
  applyLanguage();
  render();
  loadRSS();
  loadStockPrices();
}

/* ---------- Filter UI ---------- */
function buildFilters() {
  const physBox = document.getElementById('filter-physics');
  const stackBox = document.getElementById('filter-stack');
  const regionBox = document.getElementById('filter-region');
  const tradingBox = document.getElementById('filter-trading');
  const eraBox = document.getElementById('filter-era');

  const countBy = (key, val) => state.vendors.filter(v => {
    if (key === 'stack') return v.stack.includes(val);
    if (key === 'trading') return tradingOf(v) === val;
    if (key === 'era') return eraOf(v) === val;
    return v[key] === val;
  }).length;

  const makeItem = (group, val) => {
    const id = `f-${group}-${val}`;
    const div = document.createElement('label');
    div.className = 'filter-item';
    div.innerHTML = `
      <input type="checkbox" id="${id}" data-group="${group}" data-val="${val}" />
      <span data-i18n="${group}_${val}">${val}</span>
      <span class="count">${countBy(group, val)}</span>
    `;
    div.querySelector('input').addEventListener('change', onFilterChange);
    return div;
  };

  PHYSICS_OPTIONS.forEach(p => physBox.appendChild(makeItem('physics', p)));
  STACK_OPTIONS.forEach(s => stackBox.appendChild(makeItem('stack', s)));
  REGION_OPTIONS.forEach(r => regionBox.appendChild(makeItem('region', r)));
  if (tradingBox) TRADING_OPTIONS.forEach(t => tradingBox.appendChild(makeItem('trading', t)));
  if (eraBox)     ERA_OPTIONS.forEach(e => eraBox.appendChild(makeItem('era', e)));
}

function onFilterChange(e) {
  const { group, val } = e.target.dataset;
  if (e.target.checked) state.filters[group].add(val);
  else state.filters[group].delete(val);
  render();
}

/* ---------- Event binding ---------- */
function bindEvents() {
  document.getElementById('search').addEventListener('input', (e) => {
    state.search = e.target.value.toLowerCase().trim();
    render();
  });
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });
  document.getElementById('clearFilters').addEventListener('click', () => {
    Object.keys(state.filters).forEach(k => state.filters[k].clear());
    document.querySelectorAll('.filter-item input').forEach(cb => cb.checked = false);
    render();
  });
  document.getElementById('viewCard').addEventListener('click', () => setView('card'));
  document.getElementById('viewTable').addEventListener('click', () => setView('table'));
  document.getElementById('langToggle').addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'zh' : 'en';
    localStorage.setItem('qvt-lang', state.lang);
    applyLanguage();
    render();
  });
  document.getElementById('themeToggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('qvt-theme', state.theme);
    applyTheme();
  });

  // Table header sort
  document.querySelectorAll('.vendor-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      state.sort = th.dataset.sort;
      document.getElementById('sortSelect').value = state.sort;
      render();
    });
  });

  // Delegated click for physics chip → open detail modal
  document.body.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-physics');
    if (chip && chip.dataset.physics) {
      e.stopPropagation();
      openPhysicsModal(chip.dataset.physics);
    }
  });

  // Modal close: backdrop, close button, Esc
  const modal = document.getElementById('physicsModal');
  if (modal) {
    modal.querySelector('.modal-backdrop').addEventListener('click', closePhysicsModal);
    modal.querySelector('.modal-close').addEventListener('click', closePhysicsModal);

    // Wire gate buttons
    modal.querySelectorAll('.bloch-gates button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.bloch) state.bloch.gate(btn.dataset.gate);
      });
    });
    modal.querySelector('.bloch-reset').addEventListener('click', () => {
      if (state.bloch) state.bloch.reset();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.modalPhysicsKey) closePhysicsModal();
  });
}

/* ---------- Physics detail modal ---------- */
async function openPhysicsModal(key) {
  const detail = state.physicsDetails[key];
  if (!detail) return;  // agnostic or missing — skip silently
  state.modalPhysicsKey = key;
  fillPhysicsModal(key);

  // Fetch and inline the SVG
  const svgBox = document.getElementById('modalSvg');
  svgBox.innerHTML = '<div style="color:var(--text-dim);font-size:12px">Loading diagram…</div>';
  try {
    const r = await fetch(`svg/${key}.svg`);
    svgBox.innerHTML = r.ok ? await r.text() : `<div style="color:var(--text-dim);font-size:12px">No diagram available</div>`;
  } catch {
    svgBox.innerHTML = `<div style="color:var(--text-dim);font-size:12px">Diagram failed to load</div>`;
  }

  document.getElementById('physicsModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Instantiate Bloch sphere
  if (window.BlochSphere && !state.bloch) {
    state.bloch = new BlochSphere(document.getElementById('blochContainer'));
  } else if (state.bloch) {
    state.bloch.reset();
  }
}

function fillPhysicsModal(key) {
  const d = state.physicsDetails[key];
  if (!d) return;
  const lang = state.lang;
  const get = (obj) => (obj && (obj[lang] || obj.en)) || '';

  document.getElementById('modalTitle').textContent = get(d.title);
  document.getElementById('modalPrinciple').textContent = get(d.principle);
  document.getElementById('modalEncoding').textContent = get(d.encoding);
  document.getElementById('modalTemp').textContent = d.operatingTemp;
  document.getElementById('modalCoherence').textContent = d.coherenceTime;

  const prosEl = document.getElementById('modalPros');
  const consEl = document.getElementById('modalCons');
  prosEl.innerHTML = (d.pros[lang] || d.pros.en || []).map(s => `<li>${s}</li>`).join('');
  consEl.innerHTML = (d.cons[lang] || d.cons.en || []).map(s => `<li>${s}</li>`).join('');

  const playersEl = document.getElementById('modalPlayers');
  playersEl.innerHTML = (d.majorPlayers || []).map(p => `<span class="player-chip">${p}</span>`).join('');
}

function closePhysicsModal() {
  document.getElementById('physicsModal').classList.add('hidden');
  document.body.style.overflow = '';
  state.modalPhysicsKey = null;
  if (state.bloch) {
    state.bloch.destroy();
    state.bloch = null;
  }
}

/* ---------- Filter & sort ---------- */
function getFiltered() {
  const { filters, search } = state;
  return state.vendors.filter(v => {
    if (filters.physics.size && !filters.physics.has(v.physics)) return false;
    if (filters.stack.size && !v.stack.some(s => filters.stack.has(s))) return false;
    if (filters.region.size && !filters.region.has(v.region)) return false;
    if (filters.trading.size && !filters.trading.has(tradingOf(v))) return false;
    if (filters.era.size && !filters.era.has(eraOf(v))) return false;
    if (search) {
      const desc = (v.desc[state.lang] || '').toLowerCase();
      const milestone = (v.milestone[state.lang] || '').toLowerCase();
      const hay = [v.name, v.physics, v.hq, desc, milestone, ...v.stack].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (state.sort === 'founded') return a.founded - b.founded;
    if (state.sort === 'physics') return a.physics.localeCompare(b.physics);
    return a.name.localeCompare(b.name);
  });
}

/* ---------- Render ---------- */
function render() {
  const list = getFiltered();
  document.getElementById('vendorCount').textContent = list.length;
  document.getElementById('vendorCountFoot').textContent = state.vendors.length;
  document.getElementById('lastUpdated').textContent = state.lastUpdated;

  const noResults = document.getElementById('noResults');
  if (list.length === 0) noResults.classList.remove('hidden');
  else noResults.classList.add('hidden');

  if (state.view === 'card') renderCards(list);
  else renderTable(list);
}

function chipForStack(stack) {
  const cls = `chip chip-${stack}`;
  const label = t(`stack_${stack}`);
  return `<span class="${cls}">${label}</span>`;
}

function renderCards(list) {
  const grid = document.getElementById('cardView');
  grid.innerHTML = list.map(v => `
    <article class="vendor-card" data-id="${v.id}">
      <div class="card-header">
        <h3 class="card-name">${v.name}</h3>
        <div>${v.stack.map(chipForStack).join('')}${stockChip(v.ticker)}</div>
      </div>
      <div class="card-meta-row">
        <span class="chip chip-physics" data-physics="${v.physics}" title="${t('click_physics_hint')}">${t('physics_' + v.physics)}</span>
        <span><b>${t('founded')}:</b> ${v.founded}</span>
        <span><b>${t('hq')}:</b> ${v.hq}</span>
      </div>
      <p class="card-desc">${v.desc[state.lang] || v.desc.en}</p>
      <div class="card-milestone"><b>${t('milestone')}:</b> ${v.milestone[state.lang] || v.milestone.en}</div>
      <div class="card-links">
        ${v.links.site ? `<a href="${v.links.site}" target="_blank" rel="noopener">🔗 ${t('website')}</a>` : ''}
        ${v.links.roadmap ? `<a href="${v.links.roadmap}" target="_blank" rel="noopener">🗺 ${t('roadmap')}</a>` : ''}
        <a href="https://news.google.com/search?q=${encodeURIComponent(v.newsQuery)}" target="_blank" rel="noopener">📰 ${t('latest')}</a>
      </div>
    </article>
  `).join('');
}

function renderTable(list) {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = list.map(v => `
    <tr data-id="${v.id}">
      <td class="name">${v.name}</td>
      <td><span class="chip chip-physics" data-physics="${v.physics}" title="${t('click_physics_hint')}">${t('physics_' + v.physics)}</span></td>
      <td>${v.stack.map(chipForStack).join(' ')}</td>
      <td>${t('region_' + v.region)}</td>
      <td>${stockChip(v.ticker)}</td>
      <td>${v.founded}</td>
      <td>${v.milestone[state.lang] || v.milestone.en}</td>
      <td><a href="https://news.google.com/search?q=${encodeURIComponent(v.newsQuery)}" target="_blank" rel="noopener">📰</a></td>
    </tr>
  `).join('');
}

/* ---------- View toggle ---------- */
function setView(v) {
  state.view = v;
  localStorage.setItem('qvt-view', v);
  applyView();
  render();
}
function applyView() {
  const card = document.getElementById('cardView');
  const table = document.getElementById('tableView');
  const cardBtn = document.getElementById('viewCard');
  const tableBtn = document.getElementById('viewTable');
  if (!card) return;
  if (state.view === 'card') {
    card.classList.remove('hidden');
    table.classList.add('hidden');
    cardBtn.classList.add('active');
    tableBtn.classList.remove('active');
  } else {
    card.classList.add('hidden');
    table.classList.remove('hidden');
    tableBtn.classList.add('active');
    cardBtn.classList.remove('active');
  }
}

/* ---------- Theme & i18n ---------- */
function applyTheme() {
  document.body.dataset.theme = state.theme;
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = state.theme === 'dark' ? '🌙' : '☀️';
}

function t(key) {
  const dict = state.i18n[state.lang] || {};
  return dict[key] || key;
}

function applyLanguage() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (val) el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    const val = t(key);
    if (val) el.placeholder = val;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const v = t(el.dataset.i18nTitle);
    if (v) el.title = v;
  });
  const langLabel = document.getElementById('langLabel');
  if (langLabel) langLabel.textContent = state.lang === 'en' ? '中文' : 'EN';
  // If a physics modal is open, refresh its text content for the new language.
  if (state.modalPhysicsKey) fillPhysicsModal(state.modalPhysicsKey);
}

/* ---------- Stock Prices ---------- */
async function loadStockPrices() {
  const CACHE_KEY = 'qvt-stock-cache';
  const TTL_MS = 5 * 60 * 1000;

  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.timestamp < TTL_MS) {
      state.stockPrices = cached.prices;
      render();
      return;
    }
  } catch {}

  const tickers = [...new Set(state.vendors.map(v => v.ticker).filter(Boolean))];
  const results = {};

  // corsproxy.io is fast (~6ms) and reliable; allorigins.win is fallback but flaky.
  // 5s timeout per proxy attempt so we don't hang the page.
  const fetchPrice = async (ticker) => {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
    const proxies = [
      `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
    ];
    let lastErr;
    for (const url of proxies) {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 5000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) { lastErr = 'http ' + res.status; continue; }
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) { lastErr = 'no meta'; continue; }
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose ?? meta.previousClose;
        const pct = prev ? ((price - prev) / prev) * 100 : 0;
        return { price, pct };
      } catch (e) {
        clearTimeout(tid);
        lastErr = e.name === 'AbortError' ? 'timeout' : e.message;
      }
    }
    return { error: true, reason: lastErr };
  };

  // Sequential with small stagger to avoid tripping proxy rate limits.
  for (const ticker of tickers) {
    results[ticker] = await fetchPrice(ticker);
    // Update UI progressively so users see chips arrive instead of all-at-once.
    state.stockPrices = { ...results };
    render();
    await new Promise(r => setTimeout(r, 150));
  }

  state.stockPrices = results;
  // Only cache if at least one ticker succeeded — otherwise we'd freeze the page
  // on all-errors for 5 min when proxies come back up.
  const anySuccess = Object.values(results).some(r => !r.error);
  if (anySuccess) {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), prices: results }));
  }
  render();
}

function stockChip(ticker) {
  if (!ticker) return '';
  const sp = state.stockPrices[ticker];
  if (!sp) return `<span class="chip chip-stock chip-stock-loading">${ticker} —</span>`;
  if (sp.error) return `<span class="chip chip-stock chip-stock-loading">${ticker} ⚠</span>`;
  const cls = sp.pct >= 0 ? 'chip-stock-up' : 'chip-stock-down';
  const sign = sp.pct >= 0 ? '+' : '';
  return `<span class="chip chip-stock ${cls}">${ticker} $${sp.price.toFixed(2)} ${sign}${sp.pct.toFixed(2)}%</span>`;
}

/* ---------- RSS (Google News aggregate) ---------- */
/* ---------- RSS news carousel: 3 items per page, rotate every 5s ---------- */
const RSS_PAGE_SIZE = 3;
const RSS_ROTATE_MS = 5000;
const rssState = { items: [], page: 0, timer: null, paused: false };

async function loadRSS() {
  const box = document.getElementById('rssFeed');
  const query = '("quantum computing" OR "quantum computer" OR qubit)';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  // Note: `count` param requires an rss2json API key; we omit it and slice client-side.
  const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;

  try {
    const res = await fetch(api);
    const data = await res.json();
    if (!data.items || !data.items.length) {
      box.innerHTML = `<p class="rss-error">${t('noNews')}</p>`;
      return;
    }
    rssState.items = data.items.slice(0, 9);  // up to 3 pages of 3
    rssState.page = 0;
    renderRssPage();
    wireRssCarousel();
    startRssTimer();
  } catch (e) {
    console.warn('RSS load failed:', e);
    box.innerHTML = `<p class="rss-error">${t('newsError')}</p>`;
  }
}

function totalRssPages() {
  return Math.max(1, Math.ceil(rssState.items.length / RSS_PAGE_SIZE));
}

function renderRssPage() {
  const box = document.getElementById('rssFeed');
  const ind = document.getElementById('rssPageIndicator');
  if (!box) return;

  const start = rssState.page * RSS_PAGE_SIZE;
  const pageItems = rssState.items.slice(start, start + RSS_PAGE_SIZE);

  box.classList.add('fading');
  setTimeout(() => {
    box.innerHTML = pageItems.map(item => {
      const date = new Date(item.pubDate).toLocaleDateString();
      const src = item.author || (item.source && item.source.name) || '';
      return `
        <a class="rss-item" href="${item.link}" target="_blank" rel="noopener">
          ${item.title}
          <span class="src">${date}${src ? ' · ' + src : ''}</span>
        </a>
      `;
    }).join('');
    box.classList.remove('fading');
  }, 180);

  if (ind) ind.textContent = `${rssState.page + 1} / ${totalRssPages()}`;
}

function rssGoto(newPage) {
  const total = totalRssPages();
  rssState.page = ((newPage % total) + total) % total;
  renderRssPage();
}
function rssNext() { rssGoto(rssState.page + 1); }
function rssPrev() { rssGoto(rssState.page - 1); }

function startRssTimer() {
  stopRssTimer();
  rssState.timer = setInterval(() => { if (!rssState.paused) rssNext(); }, RSS_ROTATE_MS);
}
function stopRssTimer() {
  if (rssState.timer) { clearInterval(rssState.timer); rssState.timer = null; }
}

function wireRssCarousel() {
  const strip = document.getElementById('rssBottom');
  const prevBtn = document.getElementById('rssPrev');
  const nextBtn = document.getElementById('rssNext');

  // Avoid double-binding if loadRSS runs again
  if (strip && !strip.dataset.wired) {
    strip.dataset.wired = '1';
    strip.addEventListener('mouseenter', () => { rssState.paused = true; });
    strip.addEventListener('mouseleave', () => { rssState.paused = false; });
  }
  if (prevBtn && !prevBtn.dataset.wired) {
    prevBtn.dataset.wired = '1';
    prevBtn.addEventListener('click', () => { rssPrev(); startRssTimer(); });
  }
  if (nextBtn && !nextBtn.dataset.wired) {
    nextBtn.dataset.wired = '1';
    nextBtn.addEventListener('click', () => { rssNext(); startRssTimer(); });
  }
}

/* ---------- Go ---------- */
document.addEventListener('DOMContentLoaded', boot);

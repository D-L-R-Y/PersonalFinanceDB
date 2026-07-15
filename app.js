/* ============================================================
   PERSONAL FINANCE DATABASE — app.js
   SQLite (sql.js) + Chart.js + localStorage persistence
   ============================================================ */

'use strict';

// ── Constants ──────────────────────────────────────────────
const DB_KEY       = 'financedb_v1';
const SETTINGS_KEY = 'financedb_settings_v1';

const DEFAULT_CATEGORIES = [
  { id: 'Food',          label: 'Food',          color: '#F59E0B' },
  { id: 'Transport',     label: 'Transport',     color: '#3B82F6' },
  { id: 'Bills',         label: 'Bills',         color: '#8B5CF6' },
  { id: 'Entertainment', label: 'Fun',           color: '#EC4899' },
  { id: 'Health',        label: 'Health',        color: '#10B981' },
  { id: 'Shopping',      label: 'Shopping',      color: '#F97316' },
  { id: 'Others',        label: 'Others',        color: '#6B7280' },
];

const DEFAULT_SETTINGS = {
  appName:    '',
  currency:   'Rp',
  categories: null,   // null = use DEFAULT_CATEGORIES
  theme:      'midnight',
  customTheme: {
    bgColor: '#1E293B',
    bgImage: null,
    primaryColor: '#3B82F6',
    borderColor: '#334155',
    textColor: '#FAFAFA'
  }
};

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// Theme definitions for the picker UI
const THEMES = [
  { id: 'midnight', name: 'Midnight',  desc: 'Deep navy — trusted classic',          preview: ['#0F172A', '#1E40AF', '#059669'], isLight: false },
  { id: 'obsidian', name: 'Obsidian',  desc: 'True OLED black — indigo glow',         preview: ['#09090B', '#6366F1', '#8B5CF6'], isLight: false },
  { id: 'ocean',    name: 'Ocean',     desc: 'Deep-sea blues — cyan tones',           preview: ['#0C1222', '#0891B2', '#14B8A6'], isLight: false },
  { id: 'forest',   name: 'Forest',    desc: 'Dark canopy — emerald accents',          preview: ['#0A1410', '#059669', '#F59E0B'], isLight: false },
  { id: 'sakura',   name: 'Sakura',    desc: 'Soft rose — warm light theme',           preview: ['#FFF5F5', '#DB2777', '#059669'], isLight: true  },
  { id: 'sand',     name: 'Sand',      desc: 'Clean warm white — gold accents',        preview: ['#FAFAF9', '#1C1917', '#A16207'], isLight: true  },
  { id: 'custom',   name: 'Custom',    desc: 'Your personalized theme',                preview: ['#1E293B', '#3B82F6', '#FAFAFA'], isLight: false },
];

// ── State ──────────────────────────────────────────────────
let db = null;
let donutChart = null;
let viewYear  = new Date().getFullYear();
let viewMonth = new Date().getMonth(); // 0-indexed
let isAllTime = false;
let pendingDeleteId   = null;
let pendingDeleteLabel = '';
let settings = { ...DEFAULT_SETTINGS };  // active settings object

// Transaction pagination state
const TX_PAGE_SIZE = 10;
let txOffset = 0;   // how many are currently shown

// Helper: get live category list (user's or default)
function getCategories() {
  return (settings.categories && settings.categories.length > 0)
    ? settings.categories
    : DEFAULT_CATEGORIES;
}

// Helper: find a category def by id
function findCategory(id) {
  return getCategories().find(c => c.id === id);
}

// ── Format Helpers ─────────────────────────────────────────
function formatRp(amount) {
  const n   = Math.abs(Math.round(amount));
  const sym = settings.currency || 'Rp';
  return sym + ' ' + n.toLocaleString('id-ID');
}

function formatDate(isoStr) {
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthRangeISO(year, month) {
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const last  = new Date(year, month + 1, 0).getDate();
  const end   = `${year}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { start, end };
}

// Live dot-formatting for Rp amount inputs (e.g. 5000 → 5.000)
function setupAmountFormatting(inputId) {
  const input = document.getElementById(inputId);
  input.addEventListener('input', () => {
    // Save cursor position before reformatting
    const cursorPos = input.selectionStart;
    const oldLen    = input.value.length;

    // Strip everything except digits
    const digits = input.value.replace(/\D/g, '');

    if (!digits) {
      input.value = '';
      return;
    }

    // Format with dots (id-ID locale uses '.' as thousands separator)
    const formatted = parseInt(digits, 10).toLocaleString('id-ID');
    input.value = formatted;

    // Restore cursor: shift it by however many chars were added/removed
    const newLen = input.value.length;
    const shift  = newLen - oldLen;
    const newPos = Math.max(0, cursorPos + shift);
    input.setSelectionRange(newPos, newPos);
  });

  // Only allow digit keys, backspace, delete, arrows, tab
  input.addEventListener('keydown', e => {
    const allowed = [
      'Backspace','Delete','ArrowLeft','ArrowRight',
      'ArrowUp','ArrowDown','Tab','Home','End'
    ];
    if (allowed.includes(e.key)) return;
    if (e.key >= '0' && e.key <= '9') return;
    // Block everything else (e, +, -, decimal)
    e.preventDefault();
  });
}

// Read the numeric value back (strip dots before parsing)
function parseAmountInput(inputId) {
  const raw = document.getElementById(inputId).value.replace(/\./g, '');
  return raw ? parseFloat(raw) : NaN;
}

// ── Settings System ────────────────────────────────────────
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      settings = { ...DEFAULT_SETTINGS, ...parsed };
      settings.customTheme = { ...DEFAULT_SETTINGS.customTheme, ...(parsed.customTheme || {}) };
      if (!Array.isArray(settings.categories) || settings.categories.length === 0) {
        settings.categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
      }
    } else {
      settings = { ...DEFAULT_SETTINGS, categories: DEFAULT_CATEGORIES.map(c => ({ ...c })) };
    }
  } catch {
    settings = { ...DEFAULT_SETTINGS, categories: DEFAULT_CATEGORIES.map(c => ({ ...c })) };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings() {
  // Update headline in header
  const headline = document.getElementById('appHeadline');
  if (headline) {
    headline.textContent = settings.appName ? settings.appName : 'My Finances';
  }
  // Sync form fields if modal already rendered
  const nameInput = document.getElementById('settingsName');
  const curInput  = document.getElementById('settingsCurrency');
  if (nameInput) nameInput.value = settings.appName || '';
  if (curInput)  curInput.value  = settings.currency || 'Rp';
}

// ── Theme System ──────────────────────────────────────────

// Theme background colors for meta[name=theme-color] (PWA)
const THEME_META_COLORS = {
  midnight: '#0F172A',
  obsidian: '#09090B',
  ocean:    '#0C1222',
  forest:   '#0A1410',
  sakura:   '#FFF5F5',
  sand:     '#FAFAF9',
};

function applyTheme(themeName) {
  const theme = themeName || 'midnight';
  document.documentElement.setAttribute('data-theme', theme);

  if (theme === 'custom') {
    const c = settings.customTheme;
    document.documentElement.style.setProperty('--color-bg', c.bgColor);
    document.documentElement.style.setProperty('--color-primary', c.primaryColor);
    document.documentElement.style.setProperty('--color-border', c.borderColor);
    document.documentElement.style.setProperty('--color-text', c.textColor);
    
    if (c.bgImage) {
      document.body.style.backgroundImage = `url(${c.bgImage})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
      document.documentElement.setAttribute('data-has-bg-image', 'true');
    } else {
      document.body.style.backgroundImage = '';
      document.documentElement.removeAttribute('data-has-bg-image');
    }
  } else {
    document.documentElement.style.removeProperty('--color-bg');
    document.documentElement.style.removeProperty('--color-primary');
    document.documentElement.style.removeProperty('--color-border');
    document.documentElement.style.removeProperty('--color-text');
    document.body.style.backgroundImage = '';
    document.documentElement.removeAttribute('data-has-bg-image');
  }

  // Update PWA theme-color meta tag
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const baseColors = { ...THEME_META_COLORS, custom: settings.customTheme?.bgColor || '#1E293B' };
  if (metaTheme && baseColors[theme]) {
    metaTheme.setAttribute('content', baseColors[theme]);
  }
}

function renderThemePicker() {
  const grid = document.getElementById('themePickerGrid');
  if (!grid) return;
  grid.innerHTML = '';

  THEMES.forEach(theme => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'theme-swatch' + (settings.theme === theme.id ? ' selected' : '');
    swatch.dataset.theme = theme.id;

    // Use live custom settings for the Custom swatch preview
    const c = settings.customTheme;
    const preview = (theme.id === 'custom' && c) 
      ? [c.bgColor, c.primaryColor, c.textColor] 
      : theme.preview;

    swatch.innerHTML = `
      <div class="theme-swatch-preview">
        <div class="theme-swatch-dot" style="background:${preview[0]}"></div>
        <div class="theme-swatch-dot" style="background:${preview[1]}"></div>
        <div class="theme-swatch-dot" style="background:${preview[2]}"></div>
      </div>
      <div class="theme-swatch-name">${theme.name}</div>
      <div class="theme-swatch-desc">${theme.desc}</div>
    `;
    swatch.addEventListener('click', () => {
      settings.theme = theme.id;
      saveSettings();
      applyTheme(theme.id);
      
      // Toggle custom editor visibility
      const editor = document.getElementById('customThemeEditor');
      if (editor) editor.style.display = (theme.id === 'custom') ? 'block' : 'none';

      // Update selected state in picker
      grid.querySelectorAll('.theme-swatch').forEach(s => {
        s.classList.toggle('selected', s.dataset.theme === theme.id);
      });
      showToast(`Theme set to ${theme.name}`, 'success');
    });
    grid.appendChild(swatch);
  });

  // Initial visibility of custom editor
  const editor = document.getElementById('customThemeEditor');
  if (editor) editor.style.display = (settings.theme === 'custom') ? 'block' : 'none';
}

function setupCustomThemeControls() {
  const customEditor = document.getElementById('customThemeEditor');
  if (!customEditor) return;

  const bgInput      = document.getElementById('customBgColor');
  const primaryInput = document.getElementById('customPrimaryColor');
  const borderInput  = document.getElementById('customBorderColor');
  const textInput    = document.getElementById('customTextColor');
  const imageInput   = document.getElementById('customBgImageInput');
  const btnRemoveBg  = document.getElementById('btnRemoveCustomBg');

  const c = settings.customTheme;
  if (!c) return;

  bgInput.value      = c.bgColor;
  primaryInput.value = c.primaryColor;
  borderInput.value  = c.borderColor;
  textInput.value    = c.textColor;
  if (c.bgImage) {
    btnRemoveBg.style.display = 'inline-flex';
  }

  const updateCustom = () => {
    c.bgColor      = bgInput.value;
    c.primaryColor = primaryInput.value;
    c.borderColor  = borderInput.value;
    c.textColor    = textInput.value;
    saveSettings();
    if (settings.theme === 'custom') {
      applyTheme('custom');
      // Update the swatch preview dots
      renderThemePicker();
    }
  };

  bgInput.addEventListener('input', updateCustom);
  primaryInput.addEventListener('input', updateCustom);
  borderInput.addEventListener('input', updateCustom);
  textInput.addEventListener('input', updateCustom);

  imageInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX = 1080;
        if (width > height) {
          if (width > MAX) { height *= MAX / width; width = MAX; }
        } else {
          if (height > MAX) { width *= MAX / height; height = MAX; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.6); // Compress
        c.bgImage = dataUrl;
        btnRemoveBg.style.display = 'inline-flex';
        updateCustom();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  btnRemoveBg.addEventListener('click', () => {
    c.bgImage = null;
    btnRemoveBg.style.display = 'none';
    updateCustom();
  });
}

// Build the live category list inside Settings > Categories tab
function renderSettingsCategories() {
  const list = document.getElementById('catSettingsList');
  if (!list) return;
  list.innerHTML = '';

  getCategories().forEach((cat, idx) => {
    const isLast = cat.id === 'Others';
    const item = document.createElement('div');
    item.className = 'cat-settings-item';

    item.innerHTML = `
      <div class="cat-color-swatch" style="background:${cat.color};" title="Click to change color">
        <input type="color" value="${cat.color}" data-idx="${idx}" class="cat-color-picker" />
      </div>
      <input type="text" class="cat-name-input" value="${cat.label}" data-idx="${idx}" maxlength="24" />
      <button class="cat-delete-btn" data-idx="${idx}" title="Delete category" ${isLast ? 'disabled' : ''}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    list.appendChild(item);
  });

  // Color pickers — live update
  list.querySelectorAll('.cat-color-picker').forEach(picker => {
    // Show color on swatch background live
    picker.addEventListener('input', e => {
      const idx = parseInt(e.target.dataset.idx);
      const color = e.target.value;
      e.target.closest('.cat-color-swatch').style.background = color;
      settings.categories[idx].color = color;
      saveSettings();
      buildCategoryGrid();
    });
  });

  // Name inputs — live update on blur
  list.querySelectorAll('.cat-name-input').forEach(input => {
    input.addEventListener('blur', e => {
      const idx  = parseInt(e.target.dataset.idx);
      const name = e.target.value.trim();
      if (name) {
        settings.categories[idx].label = name;
        saveSettings();
        buildCategoryGrid();
        renderDashboard();
      } else {
        e.target.value = settings.categories[idx].label; // revert
      }
    });
  });

  // Delete buttons
  list.querySelectorAll('.cat-delete-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(btn.dataset.idx);
      settings.categories.splice(idx, 1);
      saveSettings();
      buildCategoryGrid();
      renderSettingsCategories();
      renderDashboard();
      showToast('Category deleted.', 'error');
    });
  });
}

async function initDB() {
  const SQL = await initSqlJs({
    locateFile: file => `vendor/${file}`
  });

  // Try to restore from localStorage
  const saved = localStorage.getItem(DB_KEY);
  if (saved) {
    try {
      const buf = Uint8Array.from(atob(saved), c => c.charCodeAt(0));
      db = new SQL.Database(buf);
    } catch {
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Create table if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      type     TEXT    NOT NULL CHECK(type IN ('income','expense')),
      amount   REAL    NOT NULL,
      category TEXT,
      note     TEXT,
      date     TEXT    NOT NULL
    );
  `);

  persistDB();
}

function persistDB() {
  try {
    const data   = db.export();
    const binary = String.fromCharCode(...data);
    localStorage.setItem(DB_KEY, btoa(binary));
  } catch (e) {
    console.warn('Could not persist DB:', e);
  }
}

// ── SQL Helpers ────────────────────────────────────────────
function insertTransaction(type, amount, category, note, date) {
  db.run(
    'INSERT INTO transactions (type, amount, category, note, date) VALUES (?,?,?,?,?)',
    [type, amount, category || null, note || null, date]
  );
  persistDB();
}

function deleteTransaction(id) {
  db.run('DELETE FROM transactions WHERE id = ?', [id]);
  persistDB();
}

function querySummary(where) {
  const income = db.exec(
    `SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
     FROM transactions WHERE type='income' ${where}`
  );
  const expense = db.exec(
    `SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
     FROM transactions WHERE type='expense' ${where}`
  );

  const incomeRow  = income[0]?.values[0]  || [0, 0];
  const expenseRow = expense[0]?.values[0] || [0, 0];

  return {
    totalIncome:  incomeRow[0],
    incomeCount:  incomeRow[1],
    totalExpense: expenseRow[0],
    expenseCount: expenseRow[1],
  };
}

function queryCategoryBreakdown(where) {
  const res = db.exec(
    `SELECT category, COALESCE(SUM(amount),0) as total
     FROM transactions
     WHERE type='expense' ${where}
     GROUP BY category
     ORDER BY total DESC`
  );
  if (!res.length) return [];
  return res[0].values.map(r => ({ category: r[0], total: r[1] }));
}

function queryTodaySpending() {
  const today = todayISO();
  const res = db.exec(
    `SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
     FROM transactions
     WHERE type='expense' AND date = '${today}'`
  );
  const row = res[0]?.values[0] || [0, 0];
  return { total: row[0], count: row[1] };
}

function queryRecentTransactions(where, limit = TX_PAGE_SIZE, offset = 0) {
  if (!db) return [];
  const res = db.exec(
    `SELECT id, type, amount, category, note, date
     FROM transactions
     ${where ? 'WHERE ' + where.replace('AND','').trim() : ''}
     ORDER BY date DESC, id DESC
     LIMIT ${limit} OFFSET ${offset}`
  );
  if (!res.length) return [];
  return res[0].values.map(r => ({
    id: r[0], type: r[1], amount: r[2],
    category: r[3], note: r[4], date: r[5]
  }));
}

function countTransactions(where) {
  if (!db) return 0;
  const res = db.exec(
    `SELECT COUNT(*) FROM transactions
     ${where ? 'WHERE ' + where.replace('AND','').trim() : ''}`
  );
  return res.length ? res[0].values[0][0] : 0;
}

// ── Build WHERE clause ─────────────────────────────────────
function buildWhere() {
  if (isAllTime) return '';
  const { start, end } = monthRangeISO(viewYear, viewMonth);
  return `AND date >= '${start}' AND date <= '${end}'`;
}

function buildCumulativeWhere() {
  if (isAllTime) return '';
  const { end } = monthRangeISO(viewYear, viewMonth);
  return `AND date <= '${end}'`;
}

// ── Render Dashboard ───────────────────────────────────────
function renderDashboard() {
  const where      = buildWhere();
  const summary    = querySummary(where);
  const categories = queryCategoryBreakdown(where);

  // Load ALL transactions for the period into the scrollable container
  const total = countTransactions(where);
  const txs   = queryRecentTransactions(where, total || 500, 0);

  // Summary cards
  document.getElementById('totalIncome').textContent  = formatRp(summary.totalIncome);
  document.getElementById('totalExpense').textContent = formatRp(summary.totalExpense);
  document.getElementById('incomeCount').textContent  = `${summary.incomeCount} transaction${summary.incomeCount !== 1 ? 's' : ''}`;
  document.getElementById('expenseCount').textContent = `${summary.expenseCount} transaction${summary.expenseCount !== 1 ? 's' : ''}`;

  // Balance — show negative with "−" prefix and red color when overspent
  const cumulativeWhere   = buildCumulativeWhere();
  const cumulativeSummary = querySummary(cumulativeWhere);
  const balance   = cumulativeSummary.totalIncome - cumulativeSummary.totalExpense;
  const balanceEl = document.getElementById('totalBalance');
  const balanceSub = document.getElementById('balanceSub');
  balanceEl.className = 'card-value balance';

  if (balance < 0) {
    balanceEl.textContent  = '−' + formatRp(balance);
    balanceEl.style.color  = 'var(--color-destructive-light)';
    if (balanceSub) balanceSub.textContent = 'Overspent';
  } else {
    balanceEl.textContent  = formatRp(balance);
    balanceEl.style.color  = '';
    if (balanceSub) balanceSub.textContent = 'Total Available Balance';
  }

  // Spendings Today (calendar-day)
  const todayData = queryTodaySpending();
  document.getElementById('todaySpending').textContent     = formatRp(todayData.total);
  document.getElementById('todaySpendingCount').textContent = `${todayData.count} transaction${todayData.count !== 1 ? 's' : ''} today`;

  // Top category — now shown in the donut chart card header
  const topCatHeader = document.getElementById('topCategoryHeader');
  if (categories.length > 0) {
    const top = categories[0];
    const catDef = findCategory(top.category) || { label: top.category || 'Others', color: '#6B7280' };
    const pct = ((top.total / summary.totalExpense) * 100).toFixed(1);
    document.getElementById('topCategory').textContent      = catDef.label;
    document.getElementById('topCategoryAmount').textContent = formatRp(top.total);
    document.getElementById('topCategoryPct').textContent    = `(${pct}%)`;
    
    // Set dynamic color for the top category badge and text
    topCatHeader.style.setProperty('--top-cat-color', catDef.color);
    
    topCatHeader.classList.remove('hidden');
  } else {
    document.getElementById('topCategory').textContent      = '—';
    document.getElementById('topCategoryAmount').textContent = 'No spending yet';
    document.getElementById('topCategoryPct').textContent    = '';
    
    topCatHeader.style.removeProperty('--top-cat-color');
    
    topCatHeader.classList.add('hidden');
  }

  // Month label & badges
  const label = isAllTime
    ? 'All Time'
    : `${MONTHS[viewMonth]} ${viewYear}`;
  document.getElementById('monthLabel').textContent = label;
  document.getElementById('chartBadge').textContent = isAllTime ? 'All Time' : 'This Month';
  updateTxBadge(total);

  // Month nav opacity when all-time
  document.getElementById('monthNav').style.opacity = isAllTime ? '0.4' : '1';
  document.getElementById('btnPrevMonth').disabled  = isAllTime;
  document.getElementById('btnNextMonth').disabled  = isAllTime;

  // Chart + Legend
  renderChart(categories, summary.totalExpense);

  // Transactions (all loaded, scroll to see more)
  renderTransactions(txs, total);
}

function updateTxBadge(total) {
  const badge = document.getElementById('txBadge');
  if (!badge) return;
  badge.textContent = total === 0 ? 'Empty' : `${total} total`;
}

// ── Chart Rendering ────────────────────────────────────────
function renderChart(categories, totalExpense) {
  const chartArea    = document.getElementById('chartArea');
  const noChartState = document.getElementById('noChartState');
  const legendEl     = document.getElementById('categoryLegend');
  const centerVal    = document.getElementById('chartCenterValue');

  centerVal.textContent = formatRp(totalExpense);

  if (categories.length === 0) {
    chartArea.style.display = 'none';
    noChartState.style.display = 'flex';
    if (donutChart) { donutChart.destroy(); donutChart = null; }
    return;
  }

  chartArea.style.display = 'block';
  noChartState.style.display = 'none';

  // Build data arrays
  const labels = categories.map(c => {
    const def = findCategory(c.category);
    return def ? def.label : (c.category || 'Others');
  });
  const data   = categories.map(c => c.total);
  const colors = categories.map(c => {
    const def = findCategory(c.category);
    return def ? def.color : '#6B7280';
  });

  if (donutChart) donutChart.destroy();

  const ctx = document.getElementById('donutChart').getContext('2d');
  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'CC'),  // ~80% opacity
        borderColor:     colors,
        borderWidth: 2,
        hoverOffset: 8,
        hoverBorderWidth: 3,
      }]
    },
    options: {
      responsive: true,
      // Use the explicit container height (set in CSS) rather than
      // computing aspect ratio — prevents zero-height on Android WebView
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = ((ctx.raw / totalExpense) * 100).toFixed(1);
              return ` ${formatRp(ctx.raw)}  (${pct}%)`;
            }
          },
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#F1F5F9',
          bodyColor: '#94A3B8',
          padding: 10,
          cornerRadius: 8,
        }
      },
      animation: { animateRotate: true, duration: 600, easing: 'easeInOutQuart' }
    }
  });

  // Legend
  legendEl.innerHTML = '';
  categories.forEach(c => {
    const def  = findCategory(c.category);
    const name  = def ? def.label : (c.category || 'Others');
    const color = def ? def.color : '#6B7280';
    const pct   = ((c.total / totalExpense) * 100).toFixed(1);

    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <div class="legend-dot" style="background:${color};"></div>
      <span class="legend-name">${name}</span>
      <span class="legend-pct">${pct}%</span>
      <span class="legend-amount">${formatRp(c.total)}</span>
    `;
    legendEl.appendChild(item);
  });
}

// ── Transaction List Rendering ─────────────────────────────
function renderTransactions(txs, total = 0) {
  const container = document.getElementById('transactionsList');

  if (txs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        <p>No transactions in this period.<br/>Try switching to All Time view.</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  txs.forEach(tx => {
    const isIncome = tx.type === 'income';
    const catDef   = isIncome ? null : findCategory(tx.category);
    const catColor = isIncome ? '#10B981' : (catDef ? catDef.color : '#6B7280');
    const catLabel = isIncome ? 'Income' : (catDef ? catDef.label : (tx.category || 'Others'));
    const initial  = isIncome ? '+' : catLabel.charAt(0).toUpperCase();
    const noteText = tx.note ? tx.note : '—';

    const item = document.createElement('div');
    item.className = 'tx-item';
    item.dataset.id = tx.id;
    item.innerHTML = `
      <button class="tx-row" aria-expanded="false" aria-controls="tx-detail-${tx.id}">
        <div class="tx-icon" style="background:${catColor}22;">
          <span style="
            display:inline-flex;align-items:center;justify-content:center;
            width:100%;height:100%;
            color:${catColor};
            font-family:var(--font-heading);
            font-size:0.9rem;font-weight:700;
          ">${initial}</span>
        </div>
        <div class="tx-info">
          <div class="tx-category">${catLabel}</div>
        </div>
        <span class="tx-amount ${isIncome ? 'income' : 'expense'}">
          ${isIncome ? '+' : '−'}&nbsp;${formatRp(tx.amount)}
        </span>
        <svg class="tx-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="tx-detail" id="tx-detail-${tx.id}">
        <div class="tx-detail-inner">
          <div class="tx-detail-content">
            <div class="tx-detail-row">
              <span class="tx-detail-label">Note</span>
              <span class="tx-detail-value">${noteText}</span>
            </div>
            <div class="tx-detail-row">
              <span class="tx-detail-label">Date</span>
              <span class="tx-detail-value">${formatDate(tx.date)}</span>
            </div>
            <div class="tx-detail-actions">
              <button class="tx-delete" data-id="${tx.id}" title="Delete transaction" aria-label="Delete transaction">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(item);

    // Accordion toggle — simple class-based, no inline styles needed
    const rowBtn  = item.querySelector('.tx-row');
    const detail  = item.querySelector('.tx-detail');
    const chevron = item.querySelector('.tx-chevron');
    rowBtn.addEventListener('click', () => {
      const isOpen = detail.classList.toggle('tx-detail--open');
      rowBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      chevron.classList.toggle('tx-chevron--open', isOpen);

      // Emil Kowalski WAAPI programmatic animation
      if (isOpen) {
        detail.style.height = 'auto'; // Set to auto so it scales correctly if window resizes
        const targetHeight = detail.scrollHeight + 'px';
        detail.animate([
          { height: '0px' },
          { height: targetHeight }
        ], {
          duration: 300,
          easing: 'cubic-bezier(0.32, 0.72, 0, 1)'
        });
      } else {
        const currentHeight = detail.scrollHeight + 'px';
        detail.style.height = '0px';
        detail.animate([
          { height: currentHeight },
          { height: '0px' }
        ], {
          duration: 300,
          easing: 'cubic-bezier(0.32, 0.72, 0, 1)'
        });
      }
    });
  });

  // Delete handlers
  container.querySelectorAll('.tx-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id    = parseInt(btn.dataset.id);
      const item  = btn.closest('.tx-item');
      const label = item.querySelector('.tx-category')?.textContent || 'this transaction';
      const amt   = item.querySelector('.tx-amount')?.textContent.trim() || '';
      openDeleteModal(id, `${label} · ${amt}`);
    });
  });
}

// ── Category Grid (spending modal) ────────────────────────
function buildCategoryGrid() {
  const grid = document.getElementById('categoryGrid');
  if (!grid) return;
  grid.innerHTML = '';

  getCategories().forEach(cat => {
    const initial = cat.label.charAt(0).toUpperCase();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-btn';
    btn.dataset.cat = cat.id;
    btn.innerHTML = `
      <span style="
        display:inline-flex;align-items:center;justify-content:center;
        width:26px;height:26px;border-radius:8px;
        background:${cat.color}33;
        color:${cat.color};
        font-family:var(--font-heading);
        font-size:0.85rem;font-weight:700;
        margin-bottom:2px;
      ">${initial}</span>
      <span>${cat.label}</span>
    `;
    btn.addEventListener('click', () => selectCategory(cat.id, cat.color));
    grid.appendChild(btn);
  });
}

let selectedCatColor = null;
function selectCategory(id, color) {
  selectedCatColor = color;
  document.getElementById('selectedCategory').value = id;
  document.querySelectorAll('.cat-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.cat === id);
    if (b.dataset.cat === id) {
      b.style.borderColor = color;
      b.style.color = color;
    } else {
      b.style.borderColor = '';
      b.style.color = '';
    }
  });
}

// ── Modal Helpers ──────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// ── Delete Confirmation Modal ──────────────────────────────
function openDeleteModal(id, label) {
  pendingDeleteId    = id;
  pendingDeleteLabel = label;
  document.getElementById('deleteModalDetail').textContent = label;
  openModal('modalDelete');
}

// ── Toast ──────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-dot ${type}"></span>${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 2800);
}

// ── Month Navigation ───────────────────────────────────────
function updateMonthView(delta) {
  if (isAllTime) return;
  viewMonth += delta;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  if (viewMonth < 0)  { viewMonth = 11; viewYear--; }
  renderDashboard();
}

// ── Export / Import ────────────────────────────────────────
function exportDB() {
  const data = db.export();
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `finance_${new Date().toISOString().slice(0,10)}.db`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Database exported successfully!', 'success');
}

function importDB(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const SQL = await initSqlJs({
        locateFile: f => `vendor/${f}`
      });
      const buf = new Uint8Array(e.target.result);
      db = new SQL.Database(buf);
      persistDB();
      renderDashboard();
      showToast('Database imported successfully!', 'success');
    } catch {
      showToast('Failed to import database.', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── CSV & JSON Export/Import ───────────────────────────────

function escapeCSV(str) {
  if (typeof str !== 'string') return str;
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseCSV(text) {
  const result = [];
  let row = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(current);
        current = '';
      } else if (char === '\n' || (char === '\r' && text[i+1] === '\n')) {
        if (char === '\r') i++;
        row.push(current);
        if (row.length > 1 || row[0] !== '') result.push(row);
        row = [];
        current = '';
      } else {
        current += char;
      }
    }
  }
  if (current !== '' || row.length > 0) {
    row.push(current);
    result.push(row);
  }
  return result;
}

function exportCSV() {
  const result = db.exec("SELECT id, type, amount, category, date, note FROM transactions ORDER BY date DESC");
  if (!result.length) return showToast('No transactions to export.', 'error');
  
  const headers = ['id', 'type', 'amount', 'category', 'date', 'note'];
  const rows = result[0].values.map(row => row.map(escapeCSV).join(','));
  const csvContent = [headers.join(','), ...rows].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `finance_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported to CSV!', 'success');
}

function exportJSON() {
  const result = db.exec("SELECT id, type, amount, category, date, note FROM transactions ORDER BY date DESC");
  if (!result.length) return showToast('No transactions to export.', 'error');
  
  const columns = result[0].columns;
  const data = result[0].values.map(row => {
    let obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `finance_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported to JSON!', 'success');
}

function importCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const rows = parseCSV(e.target.result);
      if (rows.length < 2) throw new Error('No data');
      
      const headers = rows[0].map(h => h.trim().toLowerCase());
      db.run("BEGIN TRANSACTION");
      let count = 0;
      
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].length !== headers.length) continue;
        const obj = {};
        headers.forEach((h, idx) => obj[h] = rows[i][idx]);
        
        if (obj.type && obj.amount && obj.date) {
          db.run(`INSERT INTO transactions (id, type, amount, category, date, note) VALUES (?, ?, ?, ?, ?, ?)`, 
                 [obj.id || Date.now().toString() + i, obj.type, parseFloat(obj.amount) || 0, obj.category || '', obj.date, obj.note || '']);
          count++;
        }
      }
      db.run("COMMIT");
      persistDB();
      renderDashboard();
      showToast(`Imported ${count} transactions from CSV!`, 'success');
    } catch (err) {
      try { db.run("ROLLBACK"); } catch(ex){}
      showToast('Failed to parse CSV.', 'error');
    }
  };
  reader.readAsText(file);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Not an array');
      
      db.run("BEGIN TRANSACTION");
      let count = 0;
      for (const obj of data) {
        if (obj.type && obj.amount && obj.date) {
          db.run(`INSERT INTO transactions (id, type, amount, category, date, note) VALUES (?, ?, ?, ?, ?, ?)`, 
                 [obj.id || Date.now().toString() + count, obj.type, parseFloat(obj.amount) || 0, obj.category || '', obj.date, obj.note || '']);
          count++;
        }
      }
      db.run("COMMIT");
      persistDB();
      renderDashboard();
      showToast(`Imported ${count} transactions from JSON!`, 'success');
    } catch (err) {
      try { db.run("ROLLBACK"); } catch(ex){}
      showToast('Failed to parse JSON.', 'error');
    }
  };
  reader.readAsText(file);
}

// ── Calculator Engine ─────────────────────────────────────

function makeCalcState() {
  return {
    currentExpr: '',
    displayVal:  '0',
    lastResult:  null,
    justEvaled:  false,
    pendingOp:   null,
  };
}

function calcInput(key, inst) {
  const { exprEl, resultEl } = inst;
  const st = inst.st;

  if (key === 'C') {
    st.currentExpr = '';
    st.displayVal  = '0';
    st.lastResult  = null;
    st.justEvaled  = false;
    st.pendingOp   = null;
    resultEl.textContent = '0';
    resultEl.classList.remove('has-result');
    exprEl.textContent   = '';
    return;
  }

  if (key === '±') {
    const n = parseFloat(st.displayVal);
    if (!isNaN(n) && n !== 0) {
      st.displayVal = String(-n);
      resultEl.textContent = formatCalcDisplay(st.displayVal);
    }
    return;
  }

  if (key === '%') {
    const n = parseFloat(st.displayVal);
    if (!isNaN(n)) {
      st.displayVal = String(n / 100);
      resultEl.textContent = formatCalcDisplay(st.displayVal);
    }
    return;
  }

  const isOp = ['+', '-', '*', '/'].includes(key);

  if (key === '=') {
    if (!st.currentExpr) return;
    const expr = st.currentExpr + st.displayVal;
    exprEl.textContent = expr + ' =';
    try {
      const result = calcEval(expr);
      if (!isFinite(result)) throw new Error('inf');
      const rounded = parseFloat(result.toFixed(10));
      st.displayVal  = String(rounded);
      st.lastResult  = rounded;
      st.currentExpr = '';
      st.justEvaled  = true;
      resultEl.textContent = formatCalcDisplay(st.displayVal);
      resultEl.classList.add('has-result');
    } catch(e) {
      resultEl.textContent = 'Error';
      st.displayVal = '0';
      st.currentExpr = '';
    }
    return;
  }

  if (isOp) {
    resultEl.classList.remove('has-result');
    if (st.justEvaled) {
      st.currentExpr = st.displayVal + ' ' + key + ' ';
      st.justEvaled = false;
    } else {
      st.currentExpr = (st.currentExpr || '') + st.displayVal + ' ' + key + ' ';
    }
    exprEl.textContent = st.currentExpr;
    st.displayVal = '0';
    st.pendingOp = key;
    return;
  }

  // Digit or decimal point
  resultEl.classList.remove('has-result');
  if (st.justEvaled) {
    st.displayVal  = '';
    st.justEvaled  = false;
    st.currentExpr = '';
  }

  if (key === '.') {
    if (st.displayVal.includes('.')) return;
    st.displayVal += '.';
  } else {
    if (st.displayVal === '0') {
      st.displayVal = key;
    } else {
      if (st.displayVal.replace(/[^\d]/g, '').length >= 15) return;
      st.displayVal += key;
    }
  }
  resultEl.textContent = formatCalcDisplay(st.displayVal);
}

/**
 * CSP-safe arithmetic evaluator — no eval / new Function.
 * Handles +, -, *, / with correct precedence.
 */
function calcEval(expr) {
  // Tokenise the expression into numbers and operators
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ') { i++; continue; }
    if ('+-*/'.includes(ch)) {
      tokens.push(ch);
      i++;
    } else if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
        num += expr[i++];
      }
      tokens.push(parseFloat(num));
    } else {
      i++; // skip unknown chars
    }
  }

  if (tokens.length === 0) throw new Error('empty');

  // First pass: * and /
  let nums = [];
  let ops  = [];
  // Split interleaved [num, op, num, op, ...] into separate arrays
  for (let k = 0; k < tokens.length; k++) {
    if (typeof tokens[k] === 'number') nums.push(tokens[k]);
    else ops.push(tokens[k]);
  }
  if (nums.length === 0) throw new Error('no numbers');

  // Apply * / first
  let ni = 0;
  while (ni < ops.length) {
    if (ops[ni] === '*' || ops[ni] === '/') {
      const r = ops[ni] === '*' ? nums[ni] * nums[ni+1] : nums[ni] / nums[ni+1];
      nums.splice(ni, 2, r);
      ops.splice(ni, 1);
    } else {
      ni++;
    }
  }

  // Apply + - left to right
  let result = nums[0];
  for (let oi = 0; oi < ops.length; oi++) {
    result = ops[oi] === '+' ? result + nums[oi+1] : result - nums[oi+1];
  }
  return result;
}

function formatCalcDisplay(val) {
  if (val === '' || val === '-') return val || '0';
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  if (val.endsWith('.')) {
    const intPart = parseInt(val, 10);
    return (isNaN(intPart) ? '0' : intPart.toLocaleString('id-ID')) + ',';
  }
  const parts = String(n).split('.');
  const intStr = parseInt(parts[0], 10).toLocaleString('id-ID');
  return parts.length > 1 ? intStr + ',' + parts[1] : intStr;
}

function bindCalcButtons(container, inst) {
  if (!container) return;
  container.querySelectorAll('.calc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      calcInput(btn.dataset.calc, inst);
      container.querySelectorAll('.calc-btn.calc-op').forEach(b => b.classList.remove('active-op'));
      if (['+', '-', '*', '/'].includes(btn.dataset.calc)) {
        btn.classList.add('active-op');
      }
    });
  });
}


function setupCalculators() {
  // ── 1. Inline calculator inside the Spending form ──────
  const spendInst = {
    exprEl:    document.getElementById('spendCalcExpr'),
    resultEl:  document.getElementById('spendCalcResult'),
    st:        makeCalcState(),
  };
  bindCalcButtons(document.getElementById('spendInlineCalc'), spendInst);

  // Toggle show/hide
  const toggleBtn   = document.getElementById('btnSpendCalcToggle');
  const inlineCalc  = document.getElementById('spendInlineCalc');
  const amtWrap     = document.getElementById('spendAmountInputWrap');
  const amtInput    = document.getElementById('spendAmount');

  toggleBtn.addEventListener('click', () => {
    const open = inlineCalc.style.display === 'none' || inlineCalc.style.display === '';
    if (open) {
      inlineCalc.style.display = 'block';
      amtWrap.style.display    = 'none';
      toggleBtn.classList.add('active');
      toggleBtn.textContent = '';
      // Re-add the SVG icon + new text
      toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/></svg> Direct input`;
    } else {
      inlineCalc.style.display = 'none';
      amtWrap.style.display    = '';
      toggleBtn.classList.remove('active');
      toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="8" y2="18"/><line x1="12" y1="18" x2="12" y2="18"/><line x1="16" y1="18" x2="16" y2="18"/></svg> Calculator`;
    }
  });

  // "Use this amount" copies the result to the amount input
  document.getElementById('btnSpendCalcUse').addEventListener('click', () => {
    const raw = spendInst.st.displayVal;
    const n   = parseFloat(raw);
    if (isNaN(n) || n <= 0) {
      showToast('Please calculate a valid amount first.', 'error');
      return;
    }
    const rounded = Math.round(n);
    // Put the rounded integer into the amount field (formatted)
    amtInput.value = rounded.toLocaleString('id-ID');
    // Switch back to direct input view
    inlineCalc.style.display = 'none';
    amtWrap.style.display    = '';
    toggleBtn.classList.remove('active');
    toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="8" y2="18"/><line x1="12" y1="18" x2="12" y2="18"/><line x1="16" y1="18" x2="16" y2="18"/></svg> Calculator`;
    showToast(`Amount set to ${formatRp(rounded)}`, 'success');
    // Reset the inline calc for next time
    calcInput('C', spendInst);
  });

  // Reset inline calc whenever the spending modal closes
  document.getElementById('closeSpending').addEventListener('click', () => {
    calcInput('C', spendInst);
    inlineCalc.style.display = 'none';
    amtWrap.style.display    = '';
    toggleBtn.classList.remove('active');
    toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="8" y2="18"/><line x1="12" y1="18" x2="12" y2="18"/><line x1="16" y1="18" x2="16" y2="18"/></svg> Calculator`;
  }, { capture: true });

  // ── 2. Floating standalone calculator ─────────────────
  const floatInst = {
    exprEl:   document.getElementById('floatCalcExpr'),
    resultEl: document.getElementById('floatCalcResult'),
    st:       makeCalcState(),
  };
  bindCalcButtons(document.getElementById('floatingCalcOverlay'), floatInst);

  document.getElementById('btnHeaderCalc').addEventListener('click', () => {
    openModal('floatingCalcOverlay');
  });
  document.getElementById('closeFloatingCalc').addEventListener('click', () => {
    closeModal('floatingCalcOverlay');
  });
  document.getElementById('floatingCalcOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('floatingCalcOverlay');
  });
}

// ── Form Validation & Submission ───────────────────────────
function setupForms() {

  // — Spending form —
  document.getElementById('formSpending').addEventListener('submit', e => {
    e.preventDefault();
    const amount   = parseAmountInput('spendAmount');
    const category = document.getElementById('selectedCategory').value;
    const note     = document.getElementById('spendNote').value.trim();
    const date     = document.getElementById('spendDate').value;

    if (!amount || amount <= 0) {
      showToast('Please enter a valid amount.', 'error');
      return;
    }
    if (!category) {
      showToast('Please select a category.', 'error');
      return;
    }
    if (!date) {
      showToast('Please select a date.', 'error');
      return;
    }

    insertTransaction('expense', amount, category, note, date);
    closeModal('modalSpending');
    document.getElementById('formSpending').reset();
    document.querySelectorAll('.cat-btn').forEach(b => {
      b.classList.remove('selected');
      b.style.borderColor = '';
      b.style.color = '';
    });
    document.getElementById('selectedCategory').value = '';
    renderDashboard();
    showToast(`Spending of ${formatRp(amount)} saved!`, 'success');
  });

  // — Income form —
  document.getElementById('formIncome').addEventListener('submit', e => {
    e.preventDefault();
    const amount = parseAmountInput('incomeAmount');
    const note   = document.getElementById('incomeNote').value.trim();
    const date   = document.getElementById('incomeDate').value;

    if (!amount || amount <= 0) {
      showToast('Please enter a valid amount.', 'error');
      return;
    }
    if (!date) {
      showToast('Please select a date.', 'error');
      return;
    }

    insertTransaction('income', amount, null, note, date);
    closeModal('modalIncome');
    document.getElementById('formIncome').reset();
    renderDashboard();
    showToast(`Income of ${formatRp(amount)} saved!`, 'success');
  });
}

// ── Event Listeners ────────────────────────────────────────
function setupEventListeners() {
  // Open modals
  document.getElementById('btnAddSpending').addEventListener('click', () => {
    document.getElementById('spendDate').value = todayISO();
    openModal('modalSpending');
    setTimeout(() => document.getElementById('spendAmount').focus(), 100);
  });

  document.getElementById('btnAddIncome').addEventListener('click', () => {
    document.getElementById('incomeDate').value = todayISO();
    openModal('modalIncome');
    setTimeout(() => document.getElementById('incomeAmount').focus(), 100);
  });

  // Close modals
  document.getElementById('closeSpending').addEventListener('click', () => closeModal('modalSpending'));
  document.getElementById('closeIncome').addEventListener('click',   () => closeModal('modalIncome'));
  document.getElementById('closeDelete').addEventListener('click',   () => closeModal('modalDelete'));

  // Delete modal — Cancel & Confirm
  document.getElementById('btnDeleteCancel').addEventListener('click', () => {
    closeModal('modalDelete');
    pendingDeleteId = null;
  });
  document.getElementById('btnDeleteConfirm').addEventListener('click', () => {
    if (pendingDeleteId !== null) {
      deleteTransaction(pendingDeleteId);
      pendingDeleteId = null;
      closeModal('modalDelete');
      renderDashboard();
      showToast('Transaction deleted.', 'error');
    }
  });

  // Click outside delete modal to cancel
  document.getElementById('modalDelete').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      closeModal('modalDelete');
      pendingDeleteId = null;
    }
  });

  // Click outside modal to close
  document.getElementById('modalSpending').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('modalSpending');
  });
  document.getElementById('modalIncome').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('modalIncome');
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('modalSpending');
      closeModal('modalIncome');
      closeModal('modalDelete');
      closeModal('modalSettings');
      closeModal('floatingCalcOverlay');
      pendingDeleteId = null;
    }
  });


  // Month navigation
  document.getElementById('btnPrevMonth').addEventListener('click', () => updateMonthView(-1));
  document.getElementById('btnNextMonth').addEventListener('click', () => updateMonthView(+1));

  // All-time toggle
  document.getElementById('btnAllTime').addEventListener('click', () => {
    isAllTime = !isAllTime;
    document.getElementById('btnAllTime').classList.toggle('active', isAllTime);
    renderDashboard();
  });

  // Settings modal
  document.getElementById('btnSettings').addEventListener('click', () => {
    applySettings();              // sync inputs with current values
    renderSettingsCategories();   // build category list
    openModal('modalSettings');
  });
  document.getElementById('closeSettings').addEventListener('click', () => closeModal('modalSettings'));
  document.getElementById('modalSettings').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('modalSettings');
  });

  // Settings tabs
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'categories') renderSettingsCategories();
      if (tab.dataset.tab === 'themes') renderThemePicker();
    });
  });

  // Save profile
  document.getElementById('btnSaveProfile').addEventListener('click', () => {
    const name = document.getElementById('settingsName').value.trim();
    const cur  = document.getElementById('settingsCurrency').value.trim();
    settings.appName  = name;
    settings.currency = cur || 'Rp';
    saveSettings();
    applySettings();
    renderDashboard();  // re-renders all amounts with new currency
    showToast('Profile saved!', 'success');
    closeModal('modalSettings');
  });

  // Add new category
  document.getElementById('btnAddCategory').addEventListener('click', () => {
    const nameInput  = document.getElementById('newCatName');
    const colorInput = document.getElementById('newCatColor');
    const name  = nameInput.value.trim();
    const color = colorInput.value;
    if (!name) { showToast('Please enter a category name.', 'error'); return; }
    if (getCategories().some(c => c.label.toLowerCase() === name.toLowerCase())) {
      showToast('A category with that name already exists.', 'error');
      return;
    }
    const id = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') + '_' + Date.now();
    settings.categories.push({ id, label: name, color });
    saveSettings();
    buildCategoryGrid();
    renderSettingsCategories();
    nameInput.value = '';
    showToast(`Category "${name}" added!`, 'success');
  });

  // Allow Enter key to add category
  document.getElementById('newCatName').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnAddCategory').click();
  });

  // Export/Import Menus
  document.getElementById('btnExportMenu').addEventListener('click', () => openModal('modalExport'));
  document.getElementById('btnImportMenu').addEventListener('click', () => openModal('modalImport'));
  document.getElementById('closeExport').addEventListener('click', () => closeModal('modalExport'));
  document.getElementById('closeImport').addEventListener('click', () => closeModal('modalImport'));

  // Export actions
  document.getElementById('btnExportDB').addEventListener('click', () => { closeModal('modalExport'); exportDB(); });
  document.getElementById('btnExportCSV').addEventListener('click', () => { closeModal('modalExport'); exportCSV(); });
  document.getElementById('btnExportJSON').addEventListener('click', () => { closeModal('modalExport'); exportJSON(); });

  // Import actions
  document.getElementById('importFileDB').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) { closeModal('modalImport'); importDB(file); e.target.value = ''; }
  });
  document.getElementById('importFileCSV').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) { closeModal('modalImport'); importCSV(file); e.target.value = ''; }
  });
  document.getElementById('importFileJSON').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) { closeModal('modalImport'); importJSON(file); e.target.value = ''; }
  });
}

// ── Bootstrap ──────────────────────────────────────────────
async function main() {
  // ── Phase 1: UI setup — always runs, DB-independent ──
  loadSettings();
  applySettings();
  applyTheme(settings.theme);
  setupCustomThemeControls();
  buildCategoryGrid();
  setupAmountFormatting('spendAmount');
  setupAmountFormatting('incomeAmount');
  setupForms();
  setupEventListeners();
  try { setupCalculators(); } catch (calcErr) {
    console.error('Calculator init failed (non-fatal):', calcErr);
  }

  // ── Phase 2: Database — failure shows error but keeps UI alive ──
  try {
    await initDB();
    renderDashboard();
  } catch (err) {
    console.error('Failed to initialize database:', err);
    document.getElementById('app').insertAdjacentHTML('afterbegin', `
      <div style="background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3);
                  border-radius:12px;padding:16px 20px;margin-bottom:20px;color:#EF4444;font-size:0.85rem;">
        <strong>Database error:</strong> Could not load sql.js.
        Try opening the app via the Electron launcher instead of directly in a browser,
        or use a local web server (e.g. <code>npx serve .</code>).
      </div>
    `);
  }
}

main();

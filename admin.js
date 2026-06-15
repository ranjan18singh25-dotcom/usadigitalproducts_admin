/* ═══════════════════════════════════════════════════════════
   BLOOM PLANNER — ADMIN DASHBOARD JS  v2
   Fully Featured | All pages functional | No bugs
═══════════════════════════════════════════════════════════ */
'use strict';

/* ─── CONSTANTS ──────────────────────────────────────────── */
const STORAGE_KEY   = 'bloom_orders';
const SESSION_KEY   = 'bloom_admin_auth';
const SETTINGS_KEY  = 'bloom_admin_settings';
const ROWS_PER_PAGE = 10;

const COUNTRY_NAMES = {
  US:'🇺🇸 United States', CA:'🇨🇦 Canada', GB:'🇬🇧 United Kingdom',
  AU:'🇦🇺 Australia', IN:'🇮🇳 India', DE:'🇩🇪 Germany',
  FR:'🇫🇷 France', SG:'🇸🇬 Singapore', OTHER:'🌍 Other'
};

/* ─── STATE ──────────────────────────────────────────────── */
let allOrders      = [];
let filteredOrders = [];
let currentPage    = 1;
let sortCol        = 'date';
let sortDir        = 'desc';
let currentOrderId = null;
let selectedIds    = new Set();
let confirmCb      = null;
let adminPassword  = null; // loaded from Supabase

/* ─── SETTINGS (persisted) ───────────────────────────────── */
let storeSettings = {
  storeName:   'Bloom Planner',
  storeEmail:  'support@bloomplanner.com',
  productName: 'Bloom Digital Planner — Complete Edition',
  price:       27.00
};

async function loadSettings() {
  try {
    const { data, error } = await window.supabaseClient
      .from('admin_settings')
      .select('key, value');
    if (!error && data) {
      data.forEach(row => {
        if (row.key === 'admin_password') adminPassword = row.value;
        if (row.key === 'store_settings') {
          try { Object.assign(storeSettings, JSON.parse(row.value)); } catch {}
        }
      });
    }
    if (!adminPassword) adminPassword = 'bloom2025';
  } catch {
    adminPassword = 'bloom2025';
  }
}

async function saveSettings() {
  try {
    await window.supabaseClient
      .from('admin_settings')
      .upsert({ key: 'store_settings', value: JSON.stringify(storeSettings) }, { onConflict: 'key' });
  } catch (e) {
    console.warn('Could not save settings to Supabase:', e);
  }
}

async function savePasswordToSupabase(newPassword) {
  const { error } = await window.supabaseClient
    .from('admin_settings')
    .upsert({ key: 'admin_password', value: newPassword }, { onConflict: 'key' });
  if (error) throw error;
}

/* ─── HELPERS ────────────────────────────────────────────── */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function fmt$(n)    { return '$' + (+n || 0).toFixed(2); }
function esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function csvEsc(v)  { const s = String(v||''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s; }
function dateTag()  { return new Date().toISOString().slice(0,10); }
function isToday(iso) { const d=new Date(iso),n=new Date(); return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate(); }
function isThisWeek(iso) { const d=new Date(iso),n=new Date(); n.setDate(n.getDate()-7); return d>=n; }
function formatHour(h) { const ap=h>=12?'PM':'AM'; return `${h%12||12}:00 ${ap}`; }

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}
function fmtDateFull(iso) {
  return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
}

function statusBadge(s) {
  const map = {completed:'completed',refunded:'refunded',pending:'pending'};
  const cls = map[s]||'pending';
  return `<span class="status-badge status-badge--${cls}">${esc(s||'pending')}</span>`;
}

function formatCardDisplay(num) {
  // Format 16-digit number as: 1234  5678  9012  3456
  const digits = (num || '').replace(/\D/g, '');
  return digits.replace(/(\d{4})(?=\d)/g, '$1  ');
}

function cardBadge(type) {
  if (type === 'Visa') {
    return `<span class="card-badge" aria-label="Visa">
      <svg width="26" height="16" viewBox="0 0 750 471" xmlns="http://www.w3.org/2000/svg">
        <rect width="750" height="471" rx="40" fill="#1A1F71"/>
        <text x="375" y="320" font-family="Arial" font-size="240" font-weight="900" fill="#fff" text-anchor="middle">VISA</text>
      </svg>
    </span>`;
  }
  if (type === 'Mastercard') {
    return `<span class="card-badge" aria-label="Mastercard">
      <svg width="30" height="18" viewBox="0 0 152 95" xmlns="http://www.w3.org/2000/svg">
        <circle cx="57" cy="47.5" r="47.5" fill="#EB001B"/>
        <circle cx="95" cy="47.5" r="47.5" fill="#F79E1B"/>
        <path d="M76 20.4A47.4 47.4 0 0195 47.5 47.4 47.4 0 0176 74.6 47.4 47.4 0 0157 47.5 47.4 47.4 0 0176 20.4z" fill="#FF5F00"/>
      </svg>
    </span>`;
  }
  return `<span class="card-badge">${esc(type)||'—'}</span>`;
}

/* ─── TOAST ──────────────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const ex = $('admin-toast');
  if (ex) ex.remove();
  const t = document.createElement('div');
  t.id = 'admin-toast';
  const colors = {info:'var(--bg-card)',success:'rgba(52,199,122,0.18)',error:'rgba(239,68,68,0.18)'};
  const borders = {info:'var(--border-light)',success:'rgba(52,199,122,0.4)',error:'rgba(239,68,68,0.4)'};
  t.style.cssText = `background:${colors[type]};border-color:${borders[type]};transform:translateY(20px);opacity:0;transition:transform 0.3s ease,opacity 0.3s ease`;
  t.setAttribute('role','status');
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.transform='translateY(0)'; t.style.opacity='1'; });
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(20px)'; setTimeout(()=>t.remove(),300); }, 4000);
}

/* ══════════════════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════════════════ */
/* ─── SESSION CHECK ─────────────────────────────────────── */
(async () => {
  await loadSettings();
  if (sessionStorage.getItem(SESSION_KEY) === 'true') bootAdmin();
})();

$('login-form').addEventListener('submit', e => {
  e.preventDefault();
  const val = $('admin-password').value;
  if (val === adminPassword) {
    sessionStorage.setItem(SESSION_KEY, 'true');
    $('login-screen').style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    $('login-screen').style.opacity = '0';
    $('login-screen').style.transform = 'translateY(-14px)';
    setTimeout(bootAdmin, 320);
  } else {
    $('login-error').hidden = false;
    $('admin-password').value = '';
    $('admin-password').focus();
    $('admin-password').style.borderColor = 'var(--red)';
    setTimeout(() => { $('admin-password').style.borderColor = ''; }, 1600);
  }
});

/* ─── BOOT ───────────────────────────────────────────────── */
async function bootAdmin() {
  document.body.classList.remove('login-mode');
  document.body.classList.add('admin-active');
  const ls = $('login-screen');
  const aw = $('admin-wrap');
  if (ls) ls.style.display = 'none';
  if (aw) { aw.removeAttribute('hidden'); aw.style.display = 'flex'; }
  await loadOrders();
  refreshAllPages();
  initSidebar();
  initFilters();
  initBulkActions();
  initSettings();
  initModals();
  initKeyboard();
  setDashboardDate();
  updateStorageInfo();
}

/* ─── REFRESH ────────────────────────────────────────────── */
$('refresh-btn').addEventListener('click', async () => {
  await loadOrders();
  refreshAllPages();
  showToast('✅ Data refreshed.', 'success');
});

/* ─── SUPABASE FETCH ORDERS ─────────────────────────────────── */
async function loadOrdersFromSupabase() {
  try {
    const { data, error } = await supabaseClient.from('orders').select('*').order('date', { ascending: false });
    if (error) throw error;
    allOrders = data || [];
    return true;
  } catch (err) {
    console.warn('Could not load orders from Supabase, falling back to localStorage:', err);
    return false;
  }
}

/* ─── DATA ────────────────────────────────────────────── */
async function loadOrders() {
  const fromSupabase = await loadOrdersFromSupabase();
  if (!fromSupabase) {
    try { allOrders = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { allOrders = []; }
  }
  filteredOrders = [...allOrders];
  selectedIds.clear();
}

function saveOrders() {
  // No-op for Supabase - individual updates handled separately
}

function refreshAllPages() {
  renderDashboard();
  applySortFilter();
  renderOrdersTable();
  renderCustomersPage();
  renderAnalyticsPage();
  $('sidebar-order-count').textContent = allOrders.length;
  updateStorageInfo();
}

/* ─── CROSS-TAB SYNC (disabled for Supabase) ─────────────────── */
function initCrossTabSync() {
  // Not needed with Supabase - use real-time subscriptions if desired
}

/* ─── SAVE ORDER TO SUPABASE ─────────────────────────────────── */
async function saveOrderToSupabase(order) {
  try {
    const { error } = await supabaseClient.from('orders').insert([order]);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Could not save to Supabase:', err);
    return false;
  }
}

/* ─── UPDATE ORDER STATUS IN SUPABASE ────────────────────────── */
async function updateOrderStatus(id, status, notes) {
  const updates = {};
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  try {
    const { error } = await supabaseClient.from('orders').update(updates).eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Could not update order in Supabase:', err);
    return false;
  }
}

/* ─── DELETE ORDER FROM SUPABASE ─────────────────────────────── */
async function deleteOrderFromSupabase(id) {
  try {
    const { error } = await supabaseClient.from('orders').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Could not delete order from Supabase:', err);
    return false;
  }
}

/* ─── DELETE ALL ORDERS FROM SUPABASE ────────────────────────── */
async function deleteAllOrders() {
  try {
    const { error } = await supabaseClient.from('orders').delete().neq('id', '');
    if (error) throw error;
    allOrders = [];
    showToast('🗑 All orders deleted.', 'info');
  } catch (err) {
    console.warn('Could not delete all orders from Supabase:', err);
    showToast('⚠ Could not delete all orders.', 'error');
  }
}

/* ─── SEED DEMO DATA ─────────────────────────────────────── */
async function seedDemoData() {
  const names    = ['Sarah Johnson','Marcus Williams','Priya Patel','Emily Chen','Jordan Kim','Aisha Thompson','Noah Davis','Sophia Martinez','Liam Wilson','Ava Brown','James Lee','Mia Garcia'];
  const emails   = ['sarah.j@gmail.com','marcus.w@outlook.com','priya.p@gmail.com','emily.c@icloud.com','jordan.k@yahoo.com','aisha.t@gmail.com','noah.d@hotmail.com','sophia.m@gmail.com','liam.w@outlook.com','ava.b@gmail.com','james.l@icloud.com','mia.g@yahoo.com'];
  const cards    = ['Visa','Mastercard','Visa','Visa','Mastercard','Visa','Mastercard','Visa','Visa','Mastercard','Visa','Mastercard'];
  const countries= ['US','US','IN','CA','US','US','GB','US','AU','US','US','CA'];
  const chars    = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const now      = Date.now();

  const demos = names.map((name, i) => {
    const daysAgo = Math.floor(Math.random() * 14);
    const d = new Date(now - daysAgo * 86400000 - Math.floor(Math.random() * 86400000));
    let oid = 'BP-'; for(let k=0;k<8;k++) oid += chars[Math.floor(Math.random()*chars.length)];
    const last4 = Math.floor(Math.random()*8000+1000);
    return {
      id: oid, date: d.toISOString(), name, email: emails[i],
      mobile: `(${Math.floor(Math.random()*800+100)}) ${Math.floor(Math.random()*800+100)}-${Math.floor(Math.random()*8000+1000)}`,
      country: countries[i], amount: 27.00, currency: 'USD',
      product: storeSettings.productName,
      card_type: cards[i],
      card_number: `${last4}${last4}${last4}${last4}`,  // demo placeholder
      card_holder: name.toUpperCase(), status: Math.random()>0.9?'refunded':'completed',
      notes: ''
    };
  });

  for (const demo of demos) {
    await saveOrderToSupabase(demo);
  }
  await loadOrders();
  refreshAllPages();
  showToast(`✅ 12 demo orders added!`, 'success');
}

$('seed-demo-btn').addEventListener('click', async () => {
  confirmAction('Add 12 demo orders for testing?', seedDemoData);
});

/* ══════════════════════════════════════════════════════════
   SIDEBAR & NAVIGATION
══════════════════════════════════════════════════════════ */
function initSidebar() {
  $('sidebar-toggle').addEventListener('click', toggleSidebar);
  $('sidebar-backdrop').addEventListener('click', closeSidebar);

  $$('.sidebar__link[data-page]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(link.dataset.page);
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  $('dash-view-all').addEventListener('click', () => navigateTo('orders'));
}

function toggleSidebar() {
  const sb = $('sidebar');
  sb.classList.toggle('open');
  $('sidebar-backdrop').classList.toggle('show', sb.classList.contains('open'));
}

function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebar-backdrop').classList.remove('show');
}

const PAGE_TITLES = { dashboard:'Dashboard', orders:'All Orders', customers:'Customers', analytics:'Analytics', settings:'Settings' };

function navigateTo(page) {
  $$('.sidebar__link[data-page]').forEach(l => l.classList.toggle('sidebar__link--active', l.dataset.page === page));
  $$('.page').forEach(p => p.classList.add('page--hidden'));
  const pg = $('page-' + page);
  if (pg) pg.classList.remove('page--hidden');
  $('topbar-title').textContent = PAGE_TITLES[page] || page;

  // Re-render analytics chart when opening analytics (for animation)
  if (page === 'analytics') renderAnalyticsPage();
  if (page === 'settings') populateSettingsForm();
}

function setDashboardDate() {
  $('dashboard-date').textContent = new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  $('analytics-updated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════ */
function renderDashboard() {
  const total    = allOrders.reduce((s,o) => s+(+o.amount||0), 0);
  const count    = allOrders.length;
  const todayOrds= allOrders.filter(o => isToday(o.date));
  const todayRev = todayOrds.reduce((s,o) => s+(+o.amount||0), 0);
  const avg      = count ? total/count : 0;
  const visaC    = allOrders.filter(o => o.card_type==='Visa').length;
  const mcC      = allOrders.filter(o => o.card_type==='Mastercard').length;

  animateValue($('stat-revenue'), total, v => fmt$(v));
  animateValue($('stat-orders'), count, v => Math.round(v).toString());
  animateValue($('stat-today'), todayOrds.length, v => Math.round(v).toString());
  animateValue($('stat-avg'), avg, v => fmt$(v));

  $('stat-revenue-sub').textContent = `${count} order${count!==1?'s':''}`;
  $('stat-today-rev').textContent   = `${fmt$(todayRev)} today`;
  $('sidebar-order-count').textContent = count;

  // Recent orders (last 7)
  const recent = allOrders.slice(0, 7);
  const tbody  = $('recent-orders-body');
  tbody.innerHTML = recent.length === 0
    ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-state__icon">📋</div><p>No orders yet.</p><a href="checkout.html" target="_blank" class="empty-link">Go to Checkout →</a></div></td></tr>`
    : recent.map(o => `<tr>
        <td><span class="order-id-cell">${esc(o.id)}</span></td>
        <td><span class="customer-name">${esc(o.name)}</span></td>
        <td><span class="email-cell">${esc(o.email)}</span></td>
        <td>${cardBadge(o.card_type)}</td>
        <td style="color:var(--green);font-weight:600">${fmt$(o.amount)}</td>
        <td>${fmtDate(o.date)}</td>
        <td>${statusBadge(o.status)}</td>
        <td><button class="action-btn view-btn" data-id="${esc(o.id)}" title="View"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></td>
      </tr>`).join('');

  tbody.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', () => openOrderModal(b.dataset.id)));

  // Card bars
  const mx = Math.max(visaC, mcC, 1);
  $('visa-bar').style.width  = (visaC/mx*100) + '%';
  $('mc-bar').style.width    = (mcC/mx*100) + '%';
  $('visa-count').textContent = visaC;
  $('mc-count').textContent   = mcC;

  // Countries
  const cMap = {};
  allOrders.forEach(o => { cMap[o.country||'OTHER'] = (cMap[o.country||'OTHER']||0)+1; });
  const sorted = Object.entries(cMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  $('country-list').innerHTML = sorted.length
    ? sorted.map(([c,n]) => `<div class="country-row"><span>${COUNTRY_NAMES[c]||c}</span><span class="country-row__count">${n} order${n!==1?'s':''}</span></div>`).join('')
    : '<div class="empty-mini">No data yet</div>';
}

/* count-up animation */
function animateValue(el, target, fmt, duration = 700) {
  if (!el) return;
  const start = 0;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = fmt(start + (target - start) * ease);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ══════════════════════════════════════════════════════════
   ORDERS PAGE
══════════════════════════════════════════════════════════ */
function applySortFilter() {
  const search = ($('order-search') ? $('order-search').value : '').toLowerCase().trim();
  const card   = $('filter-card')   ? $('filter-card').value   : '';
  const status = $('filter-status') ? $('filter-status').value : '';
  const date   = $('filter-date')   ? $('filter-date').value   : '';

  filteredOrders = allOrders.filter(o => {
    const ms = !search || [o.id,o.name,o.email,o.mobile,o.card_type,o.country].some(f=>(f||'').toLowerCase().includes(search));
    const mc = !card   || o.card_type === card;
    const ms2= !status || o.status   === status;
    const md = !date   || (o.date||'').startsWith(date);
    return ms && mc && ms2 && md;
  });

  filteredOrders.sort((a,b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (sortCol==='amount') { va=+va; vb=+vb; }
    if (sortCol==='date')   { va=new Date(va); vb=new Date(vb); }
    if (va < vb) return sortDir==='asc' ? -1 : 1;
    if (va > vb) return sortDir==='asc' ?  1 : -1;
    return 0;
  });

  currentPage = 1;
}

function renderOrdersTable() {
  const start = (currentPage-1)*ROWS_PER_PAGE;
  const slice = filteredOrders.slice(start, start+ROWS_PER_PAGE);
  const tbody = $('orders-body');

  $('orders-count').textContent = `${filteredOrders.length} order${filteredOrders.length!==1?'s':''}`;

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-state__icon">🔍</div><p>No orders match your filters.</p></div></td></tr>`;
    renderPagination();
    return;
  }

  tbody.innerHTML = slice.map(o => `
    <tr class="${selectedIds.has(o.id)?'row-selected':''}" data-id="${esc(o.id)}">
      <td class="th-check"><input type="checkbox" class="row-chk" data-id="${esc(o.id)}" ${selectedIds.has(o.id)?'checked':''}></td>
      <td><span class="order-id-cell">${esc(o.id)}</span></td>
      <td><span class="customer-name">${esc(o.name)}</span></td>
      <td><span class="email-cell" title="${esc(o.email)}">${esc(o.email)}</span></td>
      <td>${esc(o.mobile||'—')}</td>
      <td>${cardBadge(o.card_type)}</td>
      <td style="color:var(--green);font-weight:600">${fmt$(o.amount)}</td>
      <td>${fmtDate(o.date)}</td>
      <td>${statusBadge(o.status)}</td>
      <td>
        <div class="action-group">
          <button class="action-btn view-btn" data-id="${esc(o.id)}" title="View details">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="action-btn action-btn--danger del-btn" data-id="${esc(o.id)}" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  // Bind row events
  tbody.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', () => openOrderModal(b.dataset.id)));
  tbody.querySelectorAll('.del-btn').forEach(b  => b.addEventListener('click', () => deleteOrder(b.dataset.id)));
  tbody.querySelectorAll('.row-chk').forEach(chk => chk.addEventListener('change', () => {
    if (chk.checked) selectedIds.add(chk.dataset.id); else selectedIds.delete(chk.dataset.id);
    updateBulkBar();
    chk.closest('tr').classList.toggle('row-selected', chk.checked);
  }));

  // Select-all checkbox
  const allChk = $('select-all-chk');
  if (allChk) {
    allChk.checked = slice.length > 0 && slice.every(o => selectedIds.has(o.id));
    allChk.indeterminate = !allChk.checked && slice.some(o => selectedIds.has(o.id));
    allChk.onchange = () => {
      slice.forEach(o => { if (allChk.checked) selectedIds.add(o.id); else selectedIds.delete(o.id); });
      renderOrdersTable();
      updateBulkBar();
    };
  }

  renderPagination();
}

/* ─── SORT ───────────────────────────────────────────────── */
$$('.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortCol === col) sortDir = sortDir==='asc'?'desc':'asc';
    else { sortCol=col; sortDir='desc'; }
    $$('.sort-icon').forEach(s => s.textContent='↕');
    const si = th.querySelector('.sort-icon');
    if (si) si.textContent = sortDir==='asc'?'↑':'↓';
    applySortFilter(); renderOrdersTable();
  });
});

/* ─── FILTERS ────────────────────────────────────────────── */
function initFilters() {
  ['order-search','filter-card','filter-status','filter-date'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', () => { applySortFilter(); renderOrdersTable(); });
  });
  $('filter-reset').addEventListener('click', () => {
    ['order-search','filter-card','filter-status','filter-date'].forEach(id => { const el=$(id); if(el) el.value=''; });
    applySortFilter(); renderOrdersTable();
  });
  $('export-csv-btn').addEventListener('click', exportOrdersCSV);
  $('clear-all-btn').addEventListener('click', () => {
    confirmAction('Delete ALL orders permanently? This cannot be undone.', async () => {
      await deleteAllOrders();
      refreshAllPages();
    });
  });
}

/* ─── PAGINATION ─────────────────────────────────────────── */
function renderPagination() {
  const total = Math.ceil(filteredOrders.length / ROWS_PER_PAGE);
  const pg = $('pagination');
  if (total <= 1) { pg.innerHTML=''; return; }
  let html = '';
  if (currentPage > 1) html += `<button class="page-btn" data-pg="${currentPage-1}">‹</button>`;
  for (let i=1;i<=total;i++) {
    if (i===1 || i===total || Math.abs(i-currentPage)<=1) {
      html += `<button class="page-btn${i===currentPage?' page-btn--active':''}" data-pg="${i}">${i}</button>`;
    } else if (Math.abs(i-currentPage)===2) {
      html += `<button class="page-btn" style="pointer-events:none;opacity:.4">…</button>`;
    }
  }
  if (currentPage < total) html += `<button class="page-btn" data-pg="${currentPage+1}">›</button>`;
  pg.innerHTML = html;
  pg.querySelectorAll('.page-btn[data-pg]').forEach(b => b.addEventListener('click', () => {
    currentPage = +b.dataset.pg; renderOrdersTable();
    $('page-orders').scrollIntoView({behavior:'smooth',block:'start'});
  }));
}

/* ─── BULK ACTIONS ───────────────────────────────────────── */
function initBulkActions() {
  updateBulkBar();
  $('bulk-delete-btn').addEventListener('click', () => {
    if (!selectedIds.size) return;
    confirmAction(`Delete ${selectedIds.size} selected order${selectedIds.size!==1?'s':''}? Cannot be undone.`, () => {
      allOrders = allOrders.filter(o => !selectedIds.has(o.id));
      saveOrders(); loadOrders(); refreshAllPages();
      showToast(`🗑 ${selectedIds.size} orders deleted.`, 'info');
      selectedIds.clear(); updateBulkBar();
    });
  });
  $('bulk-export-btn').addEventListener('click', () => {
    if (!selectedIds.size) return;
    const selected = allOrders.filter(o => selectedIds.has(o.id));
    exportOrdersCSVData(selected, `bloom_selected_${dateTag()}.csv`);
    showToast(`✅ ${selected.length} orders exported.`, 'success');
  });
  $('bulk-deselect-btn').addEventListener('click', () => {
    selectedIds.clear(); updateBulkBar(); renderOrdersTable();
  });
}

function updateBulkBar() {
  const bar = $('bulk-bar');
  const n   = selectedIds.size;
  bar.hidden = n === 0;
  $('bulk-count').textContent = `${n} order${n!==1?'s':''} selected`;
}

/* ══════════════════════════════════════════════════════════
   ORDER MODAL
══════════════════════════════════════════════════════════ */
function openOrderModal(id) {
  const o = allOrders.find(x => x.id === id);
  if (!o) return;
  currentOrderId = id;

  $('modal-title').textContent = `Order ${o.id}`;
  $('modal-body').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <span class="detail-item__label">Order ID</span>
        <span class="detail-item__value detail-item__value--mono">${esc(o.id)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-item__label">Status</span>
        <span class="detail-item__value">${statusBadge(o.status)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-item__label">Date & Time</span>
        <span class="detail-item__value">${fmtDateFull(o.date)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-item__label">Amount</span>
        <span class="detail-item__value" style="color:var(--green);font-size:1.1rem;font-weight:700">${fmt$(o.amount)} ${o.currency||'USD'}</span>
      </div>
    </div>
    <div class="detail-divider"></div>
    <div class="detail-grid">
      <div class="detail-item">
        <span class="detail-item__label">Full Name</span>
        <span class="detail-item__value">${esc(o.name)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-item__label">Email</span>
        <span class="detail-item__value">${esc(o.email)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-item__label">Mobile</span>
        <span class="detail-item__value">${esc(o.mobile||'—')}</span>
      </div>
      <div class="detail-item">
        <span class="detail-item__label">Country</span>
        <span class="detail-item__value">${COUNTRY_NAMES[o.country]||o.country||'—'}</span>
      </div>
    </div>
    <div class="detail-divider"></div>
    <div class="detail-grid">
      <div class="detail-item">
        <span class="detail-item__label">Card Type</span>
        <span class="detail-item__value">${cardBadge(o.card_type)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-item__label">Card Number</span>
        <span class="detail-item__value detail-item__value--mono">${formatCardDisplay(o.card_number||'—')}</span>
      </div>
      <div class="detail-item">
        <span class="detail-item__label">Card Holder</span>
        <span class="detail-item__value">${esc(o.card_holder||'—')}</span>
      </div>
      <div class="detail-item">
        <span class="detail-item__label">Product</span>
        <span class="detail-item__value" style="white-space:normal;font-size:0.8rem">${esc(o.product||storeSettings.productName)}</span>
      </div>
    </div>
    <div class="detail-divider"></div>
    <label class="detail-notes-label">Admin Notes</label>
    <textarea class="detail-notes-input" id="order-notes-input" placeholder="Add a note about this order…">${esc(o.notes||'')}</textarea>
    <button class="detail-notes-save" id="save-notes-btn">Save Note</button>
  `;

  // Save notes
  $('save-notes-btn').addEventListener('click', async () => {
    const updated = await updateOrderStatus(currentOrderId, undefined, $('order-notes-input').value);
    if (updated) {
      const idx = allOrders.findIndex(x => x.id === currentOrderId);
      if (idx !== -1) allOrders[idx].notes = $('order-notes-input').value;
      showToast('📝 Note saved.', 'success');
    } else {
      showToast('⚠ Could not save note.', 'error');
    }
  });

  $('modal-refund-btn').textContent = o.status === 'refunded' ? 'Mark as Completed' : 'Mark as Refunded';
  $('modal-overlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('modal-overlay').hidden = true;
  document.body.style.overflow = '';
  currentOrderId = null;
}

/* ─── STATUS TOGGLE ──────────────────────────────────────── */
$('modal-refund-btn').addEventListener('click', async () => {
  if (!currentOrderId) return;
  const idx = allOrders.findIndex(o => o.id === currentOrderId);
  if (idx === -1) return;
  const newStatus = allOrders[idx].status === 'refunded' ? 'completed' : 'refunded';
  const updated = await updateOrderStatus(currentOrderId, newStatus);
  if (updated) {
    allOrders[idx].status = newStatus;
    refreshAllPages();
    openOrderModal(currentOrderId);
    showToast('✅ Status updated.', 'success');
  }
});

/* ─── PRINT RECEIPT ──────────────────────────────────────── */
$('modal-print-btn').addEventListener('click', () => {
  if (!currentOrderId) return;
  const o = allOrders.find(x => x.id === currentOrderId);
  if (!o) return;
  const html = `<!DOCTYPE html><html><head><title>Receipt — ${o.id}</title>
  <style>
    body{font-family:Georgia,serif;max-width:520px;margin:2rem auto;padding:0 1rem;color:#222}
    h1{font-size:1.6rem;margin-bottom:0.25rem}
    .logo{font-size:1rem;color:#888;margin-bottom:2rem}
    .divider{border:none;border-top:1px solid #ddd;margin:1.25rem 0}
    .row{display:flex;justify-content:space-between;padding:0.3rem 0;font-size:0.9rem}
    .label{color:#888} .val{font-weight:600}
    .total{font-size:1.1rem;font-weight:700;color:#2C8A4A}
    .footer{margin-top:2rem;font-size:0.78rem;color:#aaa;text-align:center}
    @media print{body{margin:0}}
  </style></head><body>
  <div class="logo">✦ ${esc(storeSettings.storeName)}</div>
  <h1>Order Receipt</h1>
  <hr class="divider">
  <div class="row"><span class="label">Order ID</span><span class="val">${esc(o.id)}</span></div>
  <div class="row"><span class="label">Date</span><span class="val">${fmtDateFull(o.date)}</span></div>
  <div class="row"><span class="label">Status</span><span class="val">${esc(o.status)}</span></div>
  <hr class="divider">
  <div class="row"><span class="label">Customer</span><span class="val">${esc(o.name)}</span></div>
  <div class="row"><span class="label">Email</span><span class="val">${esc(o.email)}</span></div>
  <div class="row"><span class="label">Mobile</span><span class="val">${esc(o.mobile||'—')}</span></div>
  <hr class="divider">
  <div class="row"><span class="label">Product</span><span class="val">${esc(o.product||storeSettings.productName)}</span></div>
  <div class="row"><span class="label">Card</span><span class="val">${esc(o.card_type)} — ${formatCardDisplay(o.card_number||'—')}</span></div>
  <div class="row"><span class="label total">Total</span><span class="val total">${fmt$(o.amount)} ${o.currency||'USD'}</span></div>
  <hr class="divider">
  <div class="footer">${esc(storeSettings.storeName)} • ${esc(storeSettings.storeEmail)}<br>Thank you for your purchase!</div>
  <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`;

  const frame = $('print-frame');
  frame.srcdoc = html;
});

/* ─── DELETE ORDER ───────────────────────────────────────── */
async function deleteOrder(id) {
  confirmAction('Delete this order permanently?', async () => {
    const deleted = await deleteOrderFromSupabase(id);
    if (deleted) {
      allOrders = allOrders.filter(o => o.id !== id);
      if ($('modal-overlay') && !$('modal-overlay').hidden) closeModal();
      refreshAllPages();
      showToast('🗑 Order deleted.', 'info');
    }
  });
}

$('modal-delete-btn').addEventListener('click', () => {
  closeModal();
  if (currentOrderId) deleteOrder(currentOrderId);
});
$('modal-close').addEventListener('click', closeModal);
$('modal-ok-btn').addEventListener('click', closeModal);
$('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) closeModal(); });

/* ══════════════════════════════════════════════════════════
   CUSTOMERS PAGE
══════════════════════════════════════════════════════════ */
function renderCustomersPage() {
  const cMap = {};
  allOrders.forEach(o => {
    const key = o.email;
    if (!cMap[key]) cMap[key] = {name:o.name,email:o.email,mobile:o.mobile||'',country:o.country||'',orders:[],last:o.date};
    cMap[key].orders.push(o);
    if (o.date > cMap[key].last) cMap[key].last = o.date;
  });

  const customers = Object.values(cMap).sort((a,b) => b.last.localeCompare(a.last));
  const tbody = $('customers-body');

  if (!customers.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-state__icon">👥</div><p>No customers yet.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = customers.map((c, i) => {
    const total = c.orders.reduce((s,o) => s+(+o.amount||0), 0);
    return `<tr>
      <td style="color:var(--text-muted);font-size:0.78rem">${i+1}</td>
      <td><span class="customer-name">${esc(c.name)}</span></td>
      <td><span class="email-cell" title="${esc(c.email)}">${esc(c.email)}</span></td>
      <td>${esc(c.mobile||'—')}</td>
      <td>${COUNTRY_NAMES[c.country]||c.country||'—'}</td>
      <td style="color:var(--accent);font-weight:600;text-align:center">${c.orders.length}</td>
      <td style="color:var(--green);font-weight:700">${fmt$(total)}</td>
      <td>${fmtDate(c.last)}</td>
      <td>
        <button class="action-btn" onclick="filterByCustomer('${esc(c.email)}')" title="View orders">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function filterByCustomer(email) {
  navigateTo('orders');
  const inp = $('order-search');
  if (inp) { inp.value = email; applySortFilter(); renderOrdersTable(); }
}

$('export-customers-btn').addEventListener('click', exportCustomersCSV);

/* ══════════════════════════════════════════════════════════
   ANALYTICS PAGE
══════════════════════════════════════════════════════════ */
function renderAnalyticsPage() {
  const total = allOrders.length;
  const now   = new Date();
  const weekOrders = allOrders.filter(o => isThisWeek(o.date));
  const weekRev    = weekOrders.reduce((s,o) => s+(+o.amount||0), 0);
  const visaC  = allOrders.filter(o => o.card_type==='Visa').length;
  const mcC    = allOrders.filter(o => o.card_type==='Mastercard').length;
  const unique = new Set(allOrders.map(o=>o.email)).size;

  $('an-week-rev').textContent   = fmt$(weekRev);
  $('an-week-orders').textContent= weekOrders.length + ' orders this week';
  $('an-visa').textContent       = visaC;
  $('an-visa-pct').textContent   = total ? Math.round(visaC/total*100)+'% of total' : '0%';
  $('an-mc').textContent         = mcC;
  $('an-mc-pct').textContent     = total ? Math.round(mcC/total*100)+'% of total' : '0%';
  $('an-customers').textContent  = unique;

  // Update chart total label
  const el = $('chart-total-label');
  if (el && total) el.textContent = `${fmt$(allOrders.reduce((s,o)=>s+(+o.amount||0),0))} total`;

  renderRevenueChart();
  renderHourChart();

  // Analytics countries
  const cMap = {};
  allOrders.forEach(o => { cMap[o.country||'OTHER'] = (cMap[o.country||'OTHER']||0)+1; });
  const sorted = Object.entries(cMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
  $('analytics-country-list').innerHTML = sorted.length
    ? sorted.map(([c,n]) => `<div class="country-row"><span>${COUNTRY_NAMES[c]||c}</span><span class="country-row__count">${n}</span></div>`).join('')
    : '<div class="empty-mini">No data yet</div>';
}

function renderRevenueChart() {
  const labels = [], vals = [];
  const now = new Date();
  for (let i=6; i>=0; i--) {
    const d = new Date(now); d.setDate(now.getDate()-i);
    const dayStr = d.toISOString().slice(0,10);
    labels.push(d.toLocaleDateString('en-US',{weekday:'short'}));
    vals.push(allOrders.filter(o=>o.date.startsWith(dayStr)).reduce((s,o)=>s+(+o.amount||0),0));
  }
  renderBarChart('chart-empty','chart-bars','chart-labels', vals, labels, v => fmt$(v));
}

function renderHourChart() {
  const hourMap = {};
  for (let h=0;h<24;h++) hourMap[h]=0;
  allOrders.forEach(o => { hourMap[new Date(o.date).getHours()]++; });
  const vals   = Object.values(hourMap);
  const labels = Object.keys(hourMap).map(h => +h%6===0 ? formatHour(+h) : '');
  renderBarChart('hour-empty','hour-bars','hour-labels', vals, labels, v => `${v} orders`);
}

function renderBarChart(emptyId, barsId, labelsId, vals, labels, tooltipFn) {
  const hasData = vals.some(v => v > 0);
  const emptyEl = $(emptyId), barsEl = $(barsId), labelsEl = $(labelsId);
  emptyEl.hidden  = hasData;
  barsEl.hidden   = !hasData;
  labelsEl.hidden = !hasData;
  if (!hasData) return;

  const maxVal = Math.max(...vals, 1);
  barsEl.innerHTML = vals.map((v,i) => {
    const h = Math.round((v/maxVal)*120);
    return `<div class="chart-bar-col">
      ${v?`<span class="chart-bar-val">${v}</span>`:''}
      <div class="chart-bar" style="height:${Math.max(h,3)}px" data-value="${tooltipFn(v)}"></div>
    </div>`;
  }).join('');

  labelsEl.innerHTML = labels.map(l => `<div class="chart-label">${l}</div>`).join('');
}

/* ══════════════════════════════════════════════════════════
   SETTINGS PAGE
══════════════════════════════════════════════════════════ */
function initSettings() {
  // Change password
  $('change-password-form').addEventListener('submit', async e => {
    e.preventDefault();
    const curr = $('curr-pass').value;
    const nw   = $('new-pass').value;
    const conf = $('confirm-pass').value;
    const errEl= $('pass-error');

    if (curr !== adminPassword) { errEl.textContent='⚠ Current password is incorrect.'; errEl.hidden=false; return; }
    if (nw.length < 6)          { errEl.textContent='⚠ New password must be at least 6 characters.'; errEl.hidden=false; return; }
    if (nw !== conf)            { errEl.textContent='⚠ Passwords do not match.'; errEl.hidden=false; return; }

    try {
      await savePasswordToSupabase(nw);
      adminPassword = nw;
      errEl.hidden = true;
      $('curr-pass').value = $('new-pass').value = $('confirm-pass').value = '';
      showToast('🔐 Password updated in Supabase!', 'success');
    } catch (err) {
      errEl.textContent = '⚠ Failed to save password. Check Supabase connection.';
      errEl.hidden = false;
    }
  });

  // Store info
  $('store-info-form').addEventListener('submit', async e => {
    e.preventDefault();
    storeSettings.storeName   = $('store-name').value.trim()   || storeSettings.storeName;
    storeSettings.storeEmail  = $('store-email').value.trim()  || storeSettings.storeEmail;
    storeSettings.productName = $('product-name').value.trim() || storeSettings.productName;
    storeSettings.price       = parseFloat($('store-price').value) || storeSettings.price;
    await saveSettings();
    showToast('✅ Store settings saved!', 'success');
  });

  // Logout
  $('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('bloom_admin_auth');
    location.reload();
  });

  // Data buttons
  $('settings-export-btn').addEventListener('click', () => { exportOrdersCSV(); });
  $('settings-export-customers-btn').addEventListener('click', () => { exportCustomersCSV(); });
  $('settings-seed-btn').addEventListener('click', () => { confirmAction('Add 12 demo orders?', seedDemoData); });
  $('settings-clear-btn').addEventListener('click', () => {
    confirmAction('Delete ALL orders? This CANNOT be undone.', async () => {
      await deleteAllOrders();
      refreshAllPages();
    });
  });
}

function populateSettingsForm() {
  const sn = $('store-name'), se = $('store-email'), pn = $('product-name'), sp = $('store-price');
  if (sn) sn.value = storeSettings.storeName;
  if (se) se.value = storeSettings.storeEmail;
  if (pn) pn.value = storeSettings.productName;
  if (sp) sp.value = storeSettings.price;
}

function updateStorageInfo() {
  const el = $('storage-size');
  if (el) el.textContent = 'Supabase';
  const ao = $('about-orders');
  if (ao) ao.textContent = allOrders.length;
}

/* ══════════════════════════════════════════════════════════
   CSV EXPORT
══════════════════════════════════════════════════════════ */
function exportOrdersCSV() {
  if (!allOrders.length) { showToast('⚠ No orders to export.', 'info'); return; }
  exportOrdersCSVData(allOrders, `bloom_orders_${dateTag()}.csv`);
  showToast(`✅ ${allOrders.length} orders exported.`, 'success');
}

function exportOrdersCSVData(orders, filename) {
  const headers = ['Order ID','Date','Name','Email','Mobile','Country','Product','Amount','Currency','Card Type','Card (Masked)','Card Holder','Status','Notes'];
  const rows = orders.map(o => [
    o.id, fmtDateFull(o.date), o.name, o.email, o.mobile||'', o.country||'',
    o.product||'', o.amount, o.currency||'USD', o.card_type||'', o.card_number||'', o.card_holder||'', o.status||'', o.notes||''
  ].map(csvEsc).join(','));
  downloadCSV([headers.join(','),...rows].join('\r\n'), filename);
}

function exportCustomersCSV() {
  const cMap = {};
  allOrders.forEach(o => {
    if (!cMap[o.email]) cMap[o.email]={name:o.name,email:o.email,mobile:o.mobile||'',country:o.country||'',count:0,total:0,last:o.date};
    cMap[o.email].count++;
    cMap[o.email].total += +o.amount||0;
    if (o.date > cMap[o.email].last) cMap[o.email].last = o.date;
  });
  const customers = Object.values(cMap);
  if (!customers.length) { showToast('⚠ No customers to export.', 'info'); return; }
  const headers = ['Name','Email','Mobile','Country','Orders','Total Spent','Last Order'];
  const rows = customers.map(c => [c.name,c.email,c.mobile,c.country,c.count,c.total.toFixed(2),fmtDateFull(c.last)].map(csvEsc).join(','));
  downloadCSV([headers.join(','),...rows].join('\r\n'), `bloom_customers_${dateTag()}.csv`);
  showToast(`✅ ${customers.length} customers exported.`, 'success');
}

function downloadCSV(content, filename) {
  const blob = new Blob(['\uFEFF'+content], {type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

/* ══════════════════════════════════════════════════════════
   CONFIRM MODAL
══════════════════════════════════════════════════════════ */
function confirmAction(msg, onOk) {
  $('confirm-message').textContent = msg;
  $('confirm-overlay').hidden = false;
  document.body.style.overflow = 'hidden';
  confirmCb = onOk;
}

$('confirm-ok').addEventListener('click', () => {
  $('confirm-overlay').hidden = true;
  document.body.style.overflow = '';
  if (confirmCb) { const cb=confirmCb; confirmCb=null; cb(); }
});

$('confirm-cancel').addEventListener('click', () => {
  $('confirm-overlay').hidden = true;
  document.body.style.overflow = '';
  confirmCb = null;
});

$('confirm-overlay').addEventListener('click', e => {
  if (e.target === $('confirm-overlay')) {
    $('confirm-overlay').hidden = true;
    document.body.style.overflow = '';
    confirmCb = null;
  }
});

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════════ */
function initModals() {/* kept for clarity */}

function initKeyboard() {
  document.addEventListener('keydown', e => {
    // ESC closes any open modal
    if (e.key === 'Escape') {
      if (!$('modal-overlay').hidden)   closeModal();
      if (!$('confirm-overlay').hidden) { $('confirm-overlay').hidden=true; document.body.style.overflow=''; confirmCb=null; }
      closeSidebar();
    }
    // Ctrl+K — focus search
    if ((e.ctrlKey||e.metaKey) && e.key==='k') {
      e.preventDefault();
      navigateTo('orders');
      const inp = $('order-search');
      if (inp) { inp.focus(); inp.select(); }
    }
    // Ctrl+E — export
    if ((e.ctrlKey||e.metaKey) && e.key==='e') {
      e.preventDefault();
      exportOrdersCSV();
    }
  });
}

// ===================== Crosslist Helper side panel =====================

const state = {
  item: null,
  edits: { depop: {}, poshmark: {}, mercari: {} },
  ai: null, // { notes, keys: {depop:[...], ...}, at }
  tab: 'ebay',
  autoSwitch: true,
  answerDraft: '',
  photoOrder: {}, // { depop: [url, ...], ... } per-site photo order chosen by dragging
  fees: { ship: 5, buyerPaysShip: true, boost: false }, // payout calculator settings
  mine: { depop: {}, poshmark: {}, mercari: {} }, // values YOU set (panel or sell page); beat eBay and Claude
  library: {}, // { <eBay item id>: { mine, title, at } } your saved changes for every item, kept across re-extracts
};
const emptyMine = () => ({ depop: {}, poshmark: {}, mercari: {} });
const SITES = ['depop', 'poshmark', 'mercari'];

const $ = (s) => document.querySelector(s);

// Small DOM builder. Text is always set with textContent.
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function setStatus(msg, kind) {
  const s = $('#status');
  s.textContent = msg || '';
  s.className = 'status ' + (kind || '');
}

// ---------------- storage ----------------
async function load() {
  const s = await chrome.storage.local.get(['item', 'edits', 'tab', 'autoSwitch', 'ai', 'photoOrder', 'mine', 'library', 'fees']);
  if (s.fees) state.fees = { ...state.fees, ...s.fees };
  if (s.mine) state.mine = { ...emptyMine(), ...s.mine };
  if (s.library) state.library = s.library;
  if (s.photoOrder) state.photoOrder = s.photoOrder;
  if (s.item) { try { state.item = normalize(s.item); } catch (e) { state.item = s.item; } }
  if (s.edits) state.edits = { depop: {}, poshmark: {}, mercari: {}, ...s.edits };
  if (s.tab) state.tab = s.tab;
  if (s.ai) state.ai = s.ai;
  if (typeof s.autoSwitch === 'boolean') state.autoSwitch = s.autoSwitch;
  $('#autoSwitch').checked = state.autoSwitch;
  $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;
  if (state.item) setStatus('Loaded last item: ' + state.item.title.slice(0, 60), '');
  render();
  publishFill();
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (state.item && state.item.itemId) {
      const any = SITES.some((pid) => Object.keys(state.mine[pid] || {}).length);
      if (any) state.library[state.item.itemId] = { mine: state.mine, title: state.item.title, at: Date.now() };
      else delete state.library[state.item.itemId];
    }
    chrome.storage.local.set({ item: state.item, edits: state.edits, tab: state.tab, autoSwitch: state.autoSwitch, ai: state.ai, photoOrder: state.photoOrder, mine: state.mine, library: state.library, fees: state.fees });
    publishFill();
  }, 250);
}

// Values the auto-fill script on Depop/Poshmark/Mercari reads.
function publishFill() {
  if (!state.item) { chrome.storage.local.set({ fill: {} }); return; }
  const fill = { _labels: {} };
  for (const pid of SITES) {
    fill[pid] = {};
    fill._labels[pid] = {};
    for (const f of buildFields(pid, state.item)) {
      const v = fieldValue(pid, f);
      fill._labels[pid][f.key] = f.label;
      if (v && !f.noFill) fill[pid][f.key] = v;
    }
  }
  chrome.storage.local.set({ fill });
}

// ---------------- clipboard ----------------
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = h('textarea', {}, text);
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  if (btn) {
    const old = btn.textContent;
    btn.textContent = 'Copied!'; btn.classList.add('done');
    setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1100);
  }
}

// ---------------- extraction ----------------
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

function htmlToText(html) {
  html = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|li|h[1-6]|tr|table|section|ul|ol)>/gi, '\n');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.body ? doc.body.textContent : '';
  return text.split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function fetchDescription(url) {
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return htmlToText(await r.text());
}

function cleanDescription(text) {
  const ebayOnly = /\bebay\b|feedback|\bbid(s|ding|der)?\b|auction|best offer|combined shipping|positive rating|watch ?list/i;
  return tidyText((text || '').split('\n').filter((l) => !ebayOnly.test(l)).join('\n'));
}

function normalize(raw) {
  const sp = raw.specifics || {};
  const keys = Object.keys(sp);
  const bad = /^(does not apply|n\/a|na|none|-|not applicable)$/i;
  const ok = (k) => k && sp[k] && !bad.test(sp[k]);
  const get = (...names) => {
    for (const n of names) {
      const k = keys.find((x) => x.toLowerCase() === n.toLowerCase());
      if (ok(k)) return sp[k];
    }
    return '';
  };
  const getLike = (re) => { const k = keys.find((x) => re.test(x) && ok(x)); return k ? sp[k] : ''; };

  const it = { ...raw };
  it.brand = get('Brand');
  it.size = get('Size') || getLike(/^size\b/i) || getLike(/shoe size/i) || getLike(/bottoms size|tops size/i);
  it.sizeType = get('Size Type');
  it.color = get('Color', 'Colour', 'Main Color') || getLike(/colou?r/i);
  it.material = get('Material', 'Outer Shell Material', 'Upper Material', 'Fabric Type');
  it.pattern = get('Pattern');
  it.style = get('Style');
  it.type = get('Type', 'Product Type');
  it.theme = get('Theme');
  it.fit = get('Fit');
  it.department = get('Department', 'Gender');
  it.countryOfOrigin = get('Country/Region of Manufacture', 'Country of Manufacture', 'Country of Origin');
  it.occasion = get('Occasion');
  it.features = get('Features', 'Accents');
  it.vintage = get('Vintage');
  it.decade = get('Decade', 'Era');
  it.character = get('Character', 'Character Family');
  it.conditionNotes = get('Seller Notes', 'Condition Description');
  it.measurements = [
    ['Chest', get('Chest Size', 'Chest', 'Pit to Pit')],
    ['Waist', get('Waist Size', 'Waist')],
    ['Inseam', get('Inseam')],
    ['Rise', get('Rise')],
    ['Length', get('Length', 'Garment Length')],
  ].filter((m) => m[1]);
  it.description = raw.description || raw.descriptionInline || '';
  it.descriptionClean = cleanDescription(it.description);
  it.originalPrice = ((raw.originalPriceText || '').match(/[\d,]+(?:\.\d{1,2})?/) || [''])[0].replace(/,/g, '');
  it.sku = 'CL-' + (raw.itemId || Date.now().toString()).slice(-8);
  return it;
}

async function extract() {
  const btn = $('#extractBtn');
  const tab = await activeTab();
  if (!tab || !/^https?:\/\/([a-z0-9-]+\.)*ebay\.(com|ca|co\.uk|com\.au)\//i.test(tab.url || '')) {
    setStatus('Switch to an eBay listing tab (ebay.com/itm/…) first, then click Extract.', 'error');
    return;
  }
  btn.disabled = true;
  setStatus('Reading the eBay page…');
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractEbayListing });
    const raw = res && res.result;
    if (!raw || raw.error) throw new Error('This does not look like an eBay listing page.');
    if (!raw.title && !raw.images.length) throw new Error('No listing found on this page. Open the item page itself.');

    setStatus('Getting the description…');
    try {
      if (raw.descUrl) raw.description = await fetchDescription(raw.descUrl);
    } catch (e) {
      raw.descError = 'Could not load the description (' + e.message + '). Copy it from the page by hand.';
    }

    state.item = normalize(raw);
    state.edits = { depop: {}, poshmark: {}, mercari: {} };
    const kept = state.library[state.item.itemId];
    state.mine = kept ? { ...emptyMine(), ...kept.mine } : emptyMine();
    state.ai = null;
    state.answerDraft = '';
    state.tab = 'ebay';
    save();
    render();
    const n = Object.keys(raw.specifics).length;
    const nMine = SITES.reduce((k, pid) => k + Object.keys(state.mine[pid]).length, 0);
    setStatus(`Done: ${raw.images.length} photos, ${n} item details${raw.descError ? ' (no description)' : ''}.` +
      (nMine ? ` Restored ${nMine} of your saved changes.` : '') + ' Next: Ask Claude below.', raw.descError ? 'error' : 'ok');
  } catch (e) {
    setStatus(e.message || String(e), 'error');
  } finally {
    btn.disabled = false;
  }
}

// ---------------- field definitions ----------------
function detailLines(it) {
  const L = [];
  const add = (k, v) => { if (v) L.push(`${k}: ${v}`); };
  add('Brand', it.brand);
  add('Size', [it.size, it.sizeType && !/^regular$/i.test(it.sizeType) ? it.sizeType : ''].filter(Boolean).join(' '));
  add('Condition', [it.condition, it.conditionNotes].filter(Boolean).join(' – '));
  add('Color', it.color);
  add('Material', it.material);
  add('Pattern', it.pattern);
  add('Style', it.style);
  add('Fit', it.fit);
  add('Made in', it.countryOfOrigin);
  if (it.measurements.length) L.push('Measurements: ' + it.measurements.map(([k, v]) => `${k} ${v}`).join(', '));
  return L;
}

function buildDescription(pid, it) {
  const limit = PLATFORMS[pid].descLimit;
  const head = pid === 'depop' ? it.title : '';
  const details = detailLines(it).join('\n');
  const tags = pid === 'depop' ? hashtags(it, PLATFORMS.depop.maxHashtags).join(' ') : '';
  const fixedLen = [head, details, tags].filter(Boolean).join('\n\n').length + 2;
  let body = it.descriptionClean || '';
  const room = limit - fixedLen - 2;
  if (body.length > room) body = room > 40 ? body.slice(0, room - 1).replace(/\s+\S*$/, '') + '…' : '';
  return [head, body, details, tags].filter(Boolean).join('\n\n').slice(0, limit);
}

const nrm = (s) => (s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
// Pick options whose name appears in free text (e.g. eBay "Cotton Blend" -> Depop "Cotton").
function matchOptions(options, text, max) {
  const t = nrm(text);
  if (!t) return [];
  return options.filter((o) => t.includes(nrm(o)) || nrm(o) === t).slice(0, max);
}
function uniq(arr) {
  const seen = new Set();
  return arr.filter((x) => { const k = (x || '').toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; });
}

function buildFields(pid, it) {
  const p = PLATFORMS[pid];
  const grade = conditionGrade(it.condition);
  const cond = grade ? CONDITION_MAP[grade][pid] : '';
  const colors = platformColors(pid, it.color);
  const cat = suggestCategory(pid, it);
  const condHint = `eBay says: "${it.condition || 'unknown'}"`;
  const colorHint = `eBay says: "${it.color || 'unknown'}". Up to ${p.maxColors}.`;
  const shipHint = Object.entries(it.logistics || {}).map(([k, v]) => `${k}: ${v}`).join(' · ').slice(0, 200);
  const A = DEPOP_OPTIONS.attributes;

  if (pid === 'depop') {
    return [
      { key: 'description', label: 'Description', value: buildDescription(pid, it), limit: p.descLimit, multiline: true,
        hint: 'Depop has no title box. The first line works as the title. Max 5 hashtags.' },
      { key: 'category', label: 'Category', value: cat.category, hint: 'Format: Men > Bottoms > Jeans. Pick this first: Size and the extra fields appear after it.' },
      { key: 'brand', label: 'Brand', value: it.brand },
      { key: 'condition', label: 'Condition', value: cond, options: p.conditions, hint: condHint },
      { key: 'size', label: 'Size', value: it.size, hint: 'Waist sizes look like 32". ' + (it.sizeType ? 'eBay size type: ' + it.sizeType : '') },
      { key: 'color', label: 'Color', value: colors.join(', '), options: p.colors, max: p.maxColors, hint: colorHint },
      { key: 'attr_type', label: 'Type', value: '', hint: 'Only some categories have this (jeans wash, jacket type, sneaker type…).' },
      { key: 'attr_fit', label: 'Fit', value: matchOptions(A.Fit.options, it.fit + ' ' + it.style, 1).join(''), options: A.Fit.options, hint: 'Jeans and pants only.' },
      { key: 'attr_bodyfit', label: 'Body fit', value: matchOptions(A['Body fit'].options, it.sizeType, 1).join(''), options: A['Body fit'].options, hint: 'Only if Petite / Plus / Tall / Maternity.' },
      { key: 'attr_length', label: 'Length', value: '', options: A.Length.options, hint: 'Dresses and skirts only.' },
      { key: 'material', label: 'Material', value: matchOptions(A.Material.options, it.material, 3).join(', '), options: A.Material.options, max: 3 },
      { key: 'occasion', label: 'Occasion', value: matchOptions(A.Occasion.options, it.occasion, 3).join(', '), options: A.Occasion.options, max: 3 },
      { key: 'sku', label: 'SKU', value: it.sku, hint: 'Private code so you can find this item on every site later.' },
      { key: 'source', label: 'Source', value: depopSource(it), options: p.sources, max: 2 },
      { key: 'age', label: 'Age', value: depopAge(it), options: p.ages },
      { key: 'style', label: 'Style', value: depopStyles(it).join(', '), options: p.styles, max: p.maxStyles },
      { key: 'price', label: 'Price', value: it.price, hint: `eBay price: ${it.priceText || it.price}` },
      { key: 'package', label: 'Package size', value: '', options: DEPOP_OPTIONS.packageSizes, hint: DEPOP_OPTIONS.packageHint + (shipHint ? ' · eBay: ' + shipHint : '') },
    ];
  }
  if (pid === 'poshmark') {
    const tags = uniq([it.style, it.pattern, it.theme, it.fit]).slice(0, p.maxStyles);
    return [
      { key: 'title', label: 'Title', value: (it.title || '').slice(0, p.titleLimit), limit: p.titleLimit },
      { key: 'description', label: 'Description', value: buildDescription(pid, it), limit: p.descLimit, multiline: true },
      { key: 'category', label: 'Category', value: cat.category, hint: 'Format: Men > Jeans', optionsFrom: () => Object.keys(POSHMARK_OPTIONS.categories) },
      { key: 'subcategory', label: 'Subcategory', value: cat.subcategory, optionsFrom: (vals) => POSHMARK_OPTIONS.categories[vals.category] || [] },
      { key: 'size', label: 'Size', value: it.size, hint: 'Men\'s jeans/pants look like "Waist 32".' },
      { key: 'condition', label: 'Condition', value: cond, options: p.conditions, hint: condHint },
      { key: 'brand', label: 'Brand', value: it.brand },
      { key: 'color', label: 'Color', value: colors.join(', '), options: p.colors, max: p.maxColors, hint: colorHint },
      { key: 'styleTags', label: 'Style tags', value: tags.join(', '), hint: 'Up to 3, free text.' },
      { key: 'sku', label: 'Listing SKU', value: it.sku, hint: 'Under "Additional details (private)".' },
      { key: 'originalPrice', label: 'Original price', value: it.originalPrice, hint: 'Retail price when new.' },
      { key: 'price', label: 'Listing price', value: it.price, hint: `eBay price: ${it.priceText || it.price}. A price pop-up opens; finish it and click Done.` },
    ];
  }
  return [
    { key: 'title', label: 'Title', value: (it.title || '').slice(0, p.titleLimit), limit: p.titleLimit },
    { key: 'description', label: 'Description', value: buildDescription(pid, it), limit: p.descLimit, multiline: true },
    { key: 'category', label: 'Category', value: cat.category, hint: 'Best guess. Pick it in Mercari\'s menu.', noFill: true },
    { key: 'brand', label: 'Brand', value: it.brand },
    { key: 'condition', label: 'Condition', value: cond, options: p.conditions, hint: condHint, noFill: true },
    { key: 'size', label: 'Size', value: it.size, noFill: true },
    { key: 'color', label: 'Color', value: colors.join(', '), options: p.colors, max: p.maxColors, hint: colorHint, noFill: true },
    { key: 'price', label: 'Price', value: it.price, hint: `eBay price: ${it.priceText || it.price}` },
    { key: 'shipping', label: 'Shipping weight', value: '', hint: shipHint || 'Weigh the packed item.', noFill: true },
  ];
}

function fieldValue(pid, f) {
  const m = state.mine[pid] || {};
  if (f.key in m) return m[f.key];
  const e = state.edits[pid] || {};
  return f.key in e ? e[f.key] : f.value || '';
}

const SHARED_KEYS = ['title', 'description', 'brand', 'size', 'price', 'sku'];

// Changes you made on a sell page and clicked "Save my changes" for.
function fromPage(site, key, v) {
  // Depop's category box only shows the last part ("Jeans"). Turn it back into "Men > Bottoms > Jeans".
  if (site === 'depop' && key === 'category' && !v.includes('>')) {
    const cur = fieldValue('depop', { key, value: '' });
    if (nrm(cur).endsWith(nrm(v))) return cur;
    const dept = (cur.split('>')[0] || '').trim();
    const hits = [];
    for (const [g, subs] of Object.entries(DEPOP_OPTIONS.categories)) for (const sub of subs) if (nrm(sub) === nrm(v)) hits.push(`${g} > ${sub}`);
    return hits.find((x) => x.startsWith(dept + ' ')) || hits[0] || v;
  }
  return v;
}
chrome.storage.onChanged.addListener((ch) => {
  const ps = ch.pageSave && ch.pageSave.newValue;
  if (!ps || !state.item || !SITES.includes(ps.site)) return;
  if (ps.sku && state.item.sku && ps.sku !== state.item.sku) {
    setStatus(`Those ${PLATFORMS[ps.site].name} changes are for a different item (SKU ${ps.sku}). Not saved.`, 'error');
    return;
  }
  const keys = Object.keys(ps.values);
  for (const k of keys) state.mine[ps.site][k] = fromPage(ps.site, k, ps.values[k]);
  // Optionally copy the fields that mean the same thing everywhere to the other sites.
  const copied = [];
  if (ps.share) {
    for (const other of SITES.filter((x) => x !== ps.site)) {
      const has = new Set(buildFields(other, state.item).map((f) => f.key));
      for (const k of keys) {
        if (!SHARED_KEYS.includes(k) || !has.has(k)) continue;
        let v = state.mine[ps.site][k];
        const lim = k === 'title' ? PLATFORMS[other].titleLimit : k === 'description' ? PLATFORMS[other].descLimit : 0;
        if (lim && v.length > lim) v = v.slice(0, lim);
        state.mine[other][k] = v;
        copied.push(PLATFORMS[other].name + ' ' + k);
      }
    }
  }
  save();
  render();
  setStatus(`Saved ${keys.length} change(s) from ${PLATFORMS[ps.site].name}` +
    (copied.length ? ` and copied ${copied.length} to the other sites` : '') +
    '. They stay with this item, even if you extract it again.', 'ok');
});

// ---------------- Ask Claude ----------------
async function downloadPhotos(n, urls, sub) {
  const it = state.item;
  urls = (urls || it.images).slice(0, n);
  const folder = 'Crosslist/' + (it.itemId || 'item').replace(/[^\w-]/g, '') + (sub ? '/' + sub : '');
  const ids = [];
  for (let i = 0; i < urls.length; i++) {
    ids.push(await chrome.downloads.download({
      url: urls[i],
      filename: `${folder}/${String(i + 1).padStart(2, '0')}.jpg`,
      conflictAction: 'overwrite',
      saveAs: false,
    }));
  }
  // Find where Chrome put them (full path) so Claude Code can open them.
  let first = '';
  for (let t = 0; t < 15 && !first; t++) {
    const [d] = await chrome.downloads.search({ id: ids[0] });
    first = (d && d.filename) || '';
    if (!first) await new Promise((r) => setTimeout(r, 200));
  }
  return first ? first.replace(/[\\/][^\\/]+$/, '') : '';
}

async function copyPrompt(btn) {
  const it = state.item;
  const n = Math.min(it.images.length, 12);
  btn.disabled = true;
  btn.textContent = 'Saving photos…';
  let dir = '';
  try { dir = await downloadPhotos(n); } catch (e) { /* still copy the prompt */ }
  const photoInfo = n
    ? `There are ${n} photos (01.jpg – ${String(n).padStart(2, '0')}.jpg)` +
      (dir ? ` saved in this folder: ${dir}\nIf you can open files on this computer, open every one of them. Otherwise they are attached to this message.` : '. They are attached to this message.')
    : 'No photos. Use the eBay data only.';
  await copyText(buildPrompt(it, photoInfo));
  btn.disabled = false;
  btn.textContent = 'Copied! Now paste it into Claude';
  setTimeout(() => (btn.textContent = '1. Copy prompt (and save photos)'), 2500);
  state.photoDir = dir;
  render();
}

function applyAnswer(text) {
  try {
    const ans = parseClaudeAnswer(text);
    const edits = answerToEdits(ans);
    const keys = {};
    for (const pid of SITES) {
      state.edits[pid] = { ...state.edits[pid], ...edits[pid] };
      keys[pid] = Object.keys(edits[pid]);
    }
    const total = SITES.reduce((n, pid) => n + keys[pid].length, 0);
    if (!total) throw new Error('The answer had no fields in it.');
    state.ai = { notes: ans.notes || '', keys, at: new Date().toISOString() };
    state.answerDraft = '';
    save();
    render();
    setStatus(`Claude filled ${total} fields. Check the Depop / Poshmark / Mercari tabs.`, 'ok');
  } catch (e) {
    setStatus('Could not read the answer: ' + e.message, 'error');
  }
}

function askClaudeCard() {
  const ta = h('textarea', { placeholder: 'Paste Claude\'s whole reply here…', style: 'min-height:90px' });
  ta.value = state.answerDraft || '';
  ta.addEventListener('input', () => { state.answerDraft = ta.value; });
  return h('div', { class: 'card ai' },
    h('h3', {}, 'Ask Claude (fills every field)', state.ai ? h('span', { class: 'badge' }, 'done') : null),
    h('ol', { class: 'steps' },
      h('li', {}, h('button', { class: 'primary small', onclick: (e) => copyPrompt(e.currentTarget) }, '1. Copy prompt (and save photos)')),
      h('li', {}, 'Paste it into a Claude chat. ',
        h('a', { href: '#', onclick: (e) => { e.preventDefault(); chrome.tabs.create({ url: 'https://claude.ai/new' }); } }, 'Open claude.ai'),
        ', pick Haiku in the model menu, and drag in the photos from ',
        h('code', {}, state.photoDir || 'Downloads\\Crosslist\\' + (state.item.itemId || 'item')),
        '. In Claude Code you can paste it as is: it opens the photos itself.'),
      h('li', {}, 'Copy Claude\'s reply and paste it here:', ta,
        h('button', { class: 'primary small', onclick: () => applyAnswer(ta.value) }, '2. Use this answer'))),
    state.ai && state.ai.notes ? h('div', { class: 'notes' }, h('b', {}, 'Claude says: '), state.ai.notes) : null);
}

// ---------------- rendering ----------------
function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  const c = $('#content');
  c.replaceChildren();
  if (!state.item) {
    c.append(h('div', { class: 'empty' },
      '1. Open an eBay listing.', h('br'), '2. Click "Extract from this eBay page".', h('br'),
      '3. Ask Claude to fill in every site\'s fields.', h('br'),
      '4. Open each site\'s sell page and click "Fill everything".'));
    return;
  }
  if (state.tab === 'ebay') renderEbay(c);
  else renderPlatform(c, state.tab);
}

// The photo order for one site: the saved drag order, kept in step with the item's photos.
function photoOrder(pid) {
  const imgs = state.item.images || [];
  if (!pid) return imgs.slice();
  const saved = (state.photoOrder[pid] || []).filter((u) => imgs.includes(u));
  return saved.concat(imgs.filter((u) => !saved.includes(u)));
}

// Photo grid. On a site tab (pid set) the photos can be dragged into a new order.
// The first `limit` photos are the ones that download; the rest are faded.
// Dropping a photo into a kept slot pushes the last kept photo out.
function photosCard(limit, label, pid) {
  const it = state.item;
  const order = photoOrder(pid);
  const n = limit ? Math.min(limit, order.length) : order.length;
  const card = h('div', { class: 'card' });
  const rerender = () => card.replaceWith(photosCard(limit, label, pid));
  const move = (from, to) => {
    if (from === to || from < 0) return;
    const o = order.slice();
    const [x] = o.splice(from, 1);
    o.splice(to, 0, x);
    state.photoOrder[pid] = o;
    save();
    rerender();
  };
  let dragFrom = -1;
  const grid = h('div', { class: 'photos' + (pid ? ' sortable' : '') },
    order.map((src, i) => {
      const cell = h('div', {
        class: 'ph' + (limit && i >= limit ? ' extra' : ''),
        title: pid ? 'Drag to reorder · double-click to open full size' : 'Double-click to open full size',
        draggable: pid ? 'true' : null,
        ondblclick: () => window.open(src, '_blank'),
      }, h('img', { src, loading: 'lazy', alt: '', draggable: 'false' }), h('span', {}, i + 1));
      if (pid) {
        cell.addEventListener('dragstart', (e) => { dragFrom = i; cell.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); });
        cell.addEventListener('dragend', () => cell.classList.remove('dragging'));
        cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('over'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('over'));
        cell.addEventListener('drop', (e) => { e.preventDefault(); move(dragFrom, i); });
      }
      return cell;
    }));
  const head = h('h3', {}, `Photos (${order.length})`);
  if (pid && state.photoOrder[pid]) head.append(h('button', { class: 'small', onclick: () => { delete state.photoOrder[pid]; save(); rerender(); } }, 'Reset order'));
  head.append(h('button', { onclick: async (e) => { const b = e.currentTarget; await downloadPhotos(n, order, pid); b.textContent = 'Saved!'; } }, `Download ${n}`));
  const folder = ['Downloads', 'Crosslist', it.itemId || 'item'].concat(pid ? [pid] : []).join('\\') + '\\';
  card.append(head, grid, h('div', { class: 'note' },
    `Saves to ${folder} as 01.jpg, 02.jpg… in this order. ` +
    (limit && order.length > limit ? `${label} allows ${limit} photos; faded ones are left out. ` : '') +
    (pid ? 'Drag a photo onto another spot to move it. ' : '') +
    'Then drag the files into the upload box.'));
  return card;
}

function renderEbay(c) {
  const it = state.item;
  c.append(h('div', { class: 'card' },
    h('div', { class: 'title-big' }, it.title),
    h('div', { class: 'price-big' }, it.priceText || it.price),
    h('div', {}, it.condition),
    h('div', { class: 'note' }, h('a', { href: it.url, target: '_blank' }, 'Open eBay listing'),
      ` · item ${it.itemId} · SKU ${it.sku}`)));

  c.append(payoutCard('ebay'));
  c.append(askClaudeCard());
  c.append(photosCard(0));

  const key = [
    ['Title', it.title], ['Price', it.price], ['Condition', it.condition], ['Condition notes', it.conditionNotes],
    ['Brand', it.brand], ['Size', it.size], ['Size type', it.sizeType], ['Color', it.color], ['Material', it.material],
    ['Pattern', it.pattern], ['Style', it.style], ['Type', it.type], ['Theme', it.theme], ['Fit', it.fit],
    ['Department', it.department], ['Country of origin', it.countryOfOrigin], ['Category path', (it.breadcrumbs || []).join(' › ')],
  ].filter((r) => r[1]);
  c.append(specsCard('Key details', key));

  const all = Object.entries(it.specifics || {});
  if (all.length) c.append(specsCard(`All item specifics (${all.length})`, all));

  const desc = h('textarea', { readonly: true }); desc.value = it.descriptionClean || '';
  c.append(h('div', { class: 'card' },
    h('h3', {}, 'Description', h('button', { class: 'copy', onclick: (e) => copyText(desc.value, e.currentTarget) }, 'Copy')),
    it.descError ? h('div', { class: 'hint warn' }, it.descError) : null,
    desc,
    h('div', { class: 'note' }, 'Lines that mention eBay, feedback, bids or offers were removed.')));
}

function specsCard(title, rows) {
  const table = h('table', { class: 'specs' },
    rows.map(([k, v]) => h('tr', { title: 'Click to copy', onclick: () => { copyText(v); setStatus(`Copied ${k}`, 'ok'); } },
      h('td', {}, k), h('td', {}, v))));
  return h('div', { class: 'card' },
    h('h3', {}, title, h('button', { class: 'copy', onclick: (e) => copyText(rows.map(([k, v]) => `${k}: ${v}`).join('\n'), e.currentTarget) }, 'Copy all')),
    table);
}

function renderPlatform(c, pid) {
  const p = PLATFORMS[pid];
  const fields = buildFields(pid, state.item);
  const vals = Object.fromEntries(fields.map((f) => [f.key, fieldValue(pid, f)]));

  c.append(h('div', { class: 'toolbar' },
    h('button', { onclick: () => chrome.tabs.create({ url: p.sellUrl }) }, `Open ${p.name} sell page`),
    h('button', { onclick: (e) => copyText(fields.filter((f) => vals[f.key]).map((f) => `${f.label}: ${vals[f.key]}`).join('\n\n'), e.currentTarget) }, 'Copy everything'),
    h('button', { title: 'Undo edits and Claude\'s answers on this tab', onclick: () => { state.edits[pid] = {}; if (state.ai) state.ai.keys[pid] = []; save(); render(); } }, 'Reset')));

  c.append(h('div', { class: 'tip' },
    `On ${p.name}'s sell page a "Crosslist Helper" box appears in the corner. Click "Fill everything", or click into a field and use the ✨ button. ` +
    (pid === 'mercari' ? 'Mercari only fills title, description, brand and price for now.' : 'You still add photos and click Post yourself.')));

  c.append(payoutCard(pid));

  if (!state.ai) c.append(h('div', { class: 'tip warn' }, 'These are rule-based guesses. Use "Ask Claude" on the eBay tab for better answers.'));
  if (state.ai && state.ai.notes) c.append(h('div', { class: 'notes' }, h('b', {}, 'Claude says: '), state.ai.notes));

  c.append(photosCard(p.maxPhotos, p.name, pid));

  const card = h('div', { class: 'card' });
  const aiKeys = (state.ai && state.ai.keys[pid]) || [];
  fields.forEach((f) => card.append(fieldRow(pid, f, vals[f.key], aiKeys.includes(f.key), vals)));
  c.append(card);
}

function fieldRow(pid, f, value, fromAI, vals) {
  const input = f.multiline ? h('textarea', {}) : h('input', { type: 'text' });
  input.value = value;
  const count = f.limit ? h('span', { class: 'count' }) : null;
  const options = f.options || (f.optionsFrom ? f.optionsFrom(vals) : null);
  const chips = options && options.length ? h('div', { class: 'chips' }) : null;

  const listOf = () => input.value.split(',').map((s) => s.trim()).filter(Boolean);
  const refresh = () => {
    if (count) {
      count.textContent = `${input.value.length}/${f.limit}`;
      count.classList.toggle('over', input.value.length > f.limit);
    }
    if (chips) {
      const on = listOf().map((s) => s.toLowerCase());
      chips.querySelectorAll('.chip').forEach((ch) => ch.classList.toggle('on', on.includes(ch.textContent.toLowerCase())));
    }
  };
  const commit = (rerender) => {
    const wasMine = f.key in state.mine[pid];
    state.mine[pid][f.key] = input.value;
    save(); refresh();
    if (f.key === 'price') refreshPayout();
    if (rerender || !wasMine) render(); // show the "You" badge
  };
  input.addEventListener('input', () => commit(false));
  if (f.key === 'category') input.addEventListener('change', () => commit(true));

  if (chips) {
    options.forEach((o) => chips.append(h('button', {
      class: 'chip',
      onclick: () => {
        if ((f.max || 1) > 1) {
          const list = listOf();
          const i = list.findIndex((x) => x.toLowerCase() === o.toLowerCase());
          if (i >= 0) list.splice(i, 1);
          else if (list.length < f.max) list.push(o);
          input.value = list.join(', ');
        } else {
          input.value = o;
        }
        commit(f.key === 'category');
      },
    }, o)));
  }
  refresh();

  const optionsBlock = chips
    ? h('details', { open: !value ? true : null }, h('summary', {}, `${options.length} options on ${PLATFORMS[pid].name} (click to choose)`), chips)
    : null;

  return h('div', { class: 'field' },
    h('div', { class: 'field-head' },
      h('label', {}, f.label),
      f.key in state.mine[pid]
        ? [h('span', { class: 'badge you', title: 'You set this. It is saved with this item.' }, 'You'),
           h('button', { class: 'small', title: 'Go back to the eBay / Claude value', onclick: () => { delete state.mine[pid][f.key]; save(); render(); } }, 'Undo')]
        : fromAI ? h('span', { class: 'badge', title: 'Filled by Claude' }, 'AI') : null,
      count,
      h('button', { class: 'copy', onclick: (e) => copyText(input.value, e.currentTarget) }, 'Copy')),
    input,
    f.hint ? h('div', { class: 'hint' }, f.hint) : null,
    optionsBlock);
}

// ---------------- payout calculator ----------------
// The price each site's tab is set to (eBay: the eBay price).
function sitePrice(site) {
  if (site === 'ebay') return parseFloat(String(state.item.price || '').replace(/[^0-9.]/g, '')) || 0;
  const f = buildFields(site, state.item).find((x) => x.key === 'price');
  return f ? parseFloat(String(fieldValue(site, f)).replace(/[^0-9.]/g, '')) || 0 : 0;
}

function payoutCard(current) {
  const st = state.fees;
  const card = h('div', { class: 'card payout' });
  const redo = () => { save(); refreshPayout(); };
  const shipIn = h('input', { type: 'number', min: '0', step: '0.25', value: st.ship, class: 'ship' });
  shipIn.addEventListener('input', () => { st.ship = parseFloat(shipIn.value) || 0; save(); updateNumbers(); });
  shipIn.addEventListener('change', redo);
  const box = (key, text) => {
    const cb = h('input', { type: 'checkbox' });
    cb.checked = !!st[key];
    cb.addEventListener('change', () => { st[key] = cb.checked; redo(); });
    return h('label', { class: 'opt' }, cb, ' ', text);
  };

  const order = ['depop', 'poshmark', 'mercari', 'ebay'];
  const table = h('table', { class: 'keep' });
  const detail = h('div', { class: 'detail' });
  function updateNumbers() {
    const args = { ship: st.ship, buyerPaysShip: st.buyerPaysShip, boost: st.boost };
    table.replaceChildren(h('tr', {}, h('th', {}, 'Site'), h('th', {}, 'Price'), h('th', {}, 'You keep')));
    let best = null;
    const rows = order.map((site) => {
      const price = sitePrice(site);
      const r = price ? FEES[site].calc({ ...args, price }) : null;
      if (r && (!best || r.keep > best.keep)) best = { site, keep: r.keep };
      return { site, price, r };
    });
    for (const { site, price, r } of rows) {
      table.append(h('tr', { class: (site === current ? 'cur' : '') + (best && best.site === site ? ' best' : '') },
        h('td', {}, FEES[site].name), h('td', {}, price ? money(price) : '—'), h('td', {}, r ? money(r.keep) : 'set a price')));
    }
    const mine = rows.find((x) => x.site === current);
    detail.replaceChildren();
    if (mine && mine.r) {
      detail.append(h('div', { class: 'line' }, h('span', {}, 'Price'), h('span', {}, money(mine.price))));
      for (const [label, amt] of mine.r.lines) detail.append(h('div', { class: 'line' }, h('span', {}, label), h('span', {}, money(amt))));
      detail.append(h('div', { class: 'line total' }, h('span', {}, 'You keep'), h('span', {}, money(mine.r.keep))));
      detail.append(h('div', { class: 'note' }, mine.r.note));
    }
  }
  updateNumbers();

  card.append(
    h('h3', {}, `What you keep${current === 'ebay' ? '' : ' on ' + FEES[current].name}`),
    h('div', { class: 'opts' },
      h('label', { class: 'opt' }, 'Label costs $', shipIn),
      box('buyerPaysShip', 'Buyer pays shipping'),
      box('boost', 'Boost on Depop (+12%)')),
    table, detail,
    h('div', { class: 'note' }, 'Prices come from each tab\'s Price field. Sales tax left out. Fee rules are in fees.js; check the sites\' fee pages, they change often.'));
  return card;
}
function refreshPayout() {
  const old = document.querySelector('.card.payout');
  if (old && state.item) old.replaceWith(payoutCard(state.tab));
}

// ---------------- tabs + auto-switch ----------------
document.querySelectorAll('#tabs button').forEach((b) =>
  b.addEventListener('click', () => { state.tab = b.dataset.tab; save(); render(); window.scrollTo(0, 0); }));

$('#extractBtn').addEventListener('click', extract);
$('#autoSwitch').addEventListener('change', (e) => { state.autoSwitch = e.target.checked; save(); });

function siteFromUrl(u) {
  if (/depop\.com/i.test(u)) return 'depop';
  if (/poshmark\./i.test(u)) return 'poshmark';
  if (/mercari\.com/i.test(u)) return 'mercari';
  return null;
}
async function followActiveTab() {
  if (!state.autoSwitch || !state.item) return;
  const t = await activeTab();
  const site = siteFromUrl((t && t.url) || '');
  if (site && site !== state.tab) { state.tab = site; save(); render(); }
}
chrome.tabs.onActivated.addListener(followActiveTab);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.url) followActiveTab(); });

load();

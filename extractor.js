// This function is injected into the eBay tab with chrome.scripting.executeScript.
// It must be fully self-contained (no references to anything outside it).
function extractEbayListing() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const txt = (el) => (el ? clean(el.textContent) : '');
  const first = (...sels) => {
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && txt(el)) return el;
    }
    return null;
  };

  if (!/(^|\.)ebay\./.test(location.hostname)) return { error: 'not-ebay' };

  const out = {
    url: location.href.split('#')[0],
    extractedAt: new Date().toISOString(),
    itemId: '',
    title: '',
    price: '',
    currency: '',
    priceText: '',
    originalPriceText: '',
    condition: '',
    specifics: {},
    logistics: {},
    images: [],
    breadcrumbs: [],
    descUrl: '',
    descriptionInline: '',
  };

  const idMatch = location.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,})/);
  out.itemId = idMatch ? idMatch[1] : '';

  // ---- JSON-LD (structured data eBay embeds for search engines) ----
  let ld = null;
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const j = JSON.parse(s.textContent);
      const list = Array.isArray(j) ? j : j['@graph'] || [j];
      list.forEach((o) => {
        const t = o && o['@type'];
        if (!ld && (t === 'Product' || (Array.isArray(t) && t.includes('Product')))) ld = o;
      });
    } catch (e) { /* ignore bad JSON */ }
  });

  // ---- Title ----
  out.title =
    txt(first('h1.x-item-title__mainTitle', '[data-testid="x-item-title"] h1', '.x-item-title h1', 'h1')) ||
    (ld && ld.name) ||
    document.title.replace(/\s*\|\s*eBay.*$/i, '');

  // ---- Price ----
  out.priceText = txt(first('[data-testid="x-price-primary"]', '.x-price-primary', '#prcIsum', '.x-bin-price'));
  let offer = ld && ld.offers;
  if (Array.isArray(offer)) offer = offer[0];
  if (offer && offer.price) out.price = String(offer.price);
  else out.price = ((out.priceText.match(/[\d,]+(?:\.\d{1,2})?/) || [''])[0]).replace(/,/g, '');
  out.currency = (offer && offer.priceCurrency) || (/\$/.test(out.priceText) ? 'USD' : '');
  out.originalPriceText = txt(first(
    '.x-price-transparency .ux-textspans--STRIKETHROUGH',
    '.x-additional-info .ux-textspans--STRIKETHROUGH',
    '.ux-textspans--STRIKETHROUGH'
  ));

  // ---- Item specifics (label/value rows) ----
  const junk = /(Read more|Read less|See all condition definitions|opens in a new window or tab|See the seller's listing for full details\.?|about the (seller notes|condition))/gi;
  const valueText = (el) => {
    const blocks = el.querySelectorAll('[class*="expandable-textual-display-block"]');
    if (blocks.length > 1) {
      let best = '';
      blocks.forEach((b) => { const t = clean(b.textContent); if (t.length > best.length) best = t; });
      return clean(best.replace(junk, ' '));
    }
    const c = el.cloneNode(true);
    c.querySelectorAll('button, script, style, svg').forEach((n) => n.remove());
    return clean(c.textContent.replace(junk, ' '));
  };
  const logisticsRe = /^(shipping|postage|delivery|returns|payments?|located in|item location|import charges|ships to|excludes)/i;
  const pairs = [];
  document.querySelectorAll('.ux-labels-values, [data-testid="ux-labels-values"]').forEach((row) => {
    pairs.push([row.querySelector('.ux-labels-values__labels, dt'), row.querySelector('.ux-labels-values__values, dd')]);
  });
  // Plain <dl><dt>label</dt><dd>value</dd>...</dl> lists (newer layouts)
  document.querySelectorAll('dl dt').forEach((dt) => {
    const dd = dt.nextElementSibling;
    if (dd && dd.tagName === 'DD') pairs.push([dt, dd]);
  });
  pairs.forEach(([labelEl, valEl]) => {
    if (!labelEl || !valEl) return;
    const label = txt(labelEl).replace(/:$/, '');
    if (!label || label.length > 60) return;
    let value;
    if (/^condition$/i.test(label)) {
      value = txt(valEl.querySelector('.ux-textspans')) || valueText(valEl);
      value = value.split(/:\s/)[0];
    } else {
      value = valueText(valEl);
    }
    if (!value) return;
    if (logisticsRe.test(label)) out.logistics[label] = value;
    else if (!(label in out.specifics)) out.specifics[label] = value;
  });

  // ---- Condition ----
  out.condition =
    out.specifics['Condition'] ||
    txt((first('[data-testid="x-item-condition"]', '.x-item-condition-text', '.x-item-condition-value') || document.createElement('i')).querySelector('.ux-textspans')) ||
    '';
  if (!out.condition && ld && offer && offer.itemCondition) {
    out.condition = String(offer.itemCondition).replace(/^.*\//, '').replace(/Condition$/, '');
  }

  // ---- Images ----
  const imgs = new Map();
  const addImg = (u) => {
    if (!u || !/ebayimg\.com/.test(u)) return;
    const key = (u.match(/\/images\/g\/([^/]+)\//) || u.match(/\/([^/]+)\/s-l\d+/) || [u, u])[1];
    if (imgs.has(key)) return;
    let big = u.split('?')[0].replace(/s-l\d+\.\w+$/, 's-l1600.jpg');
    imgs.set(key, big);
  };
  document.querySelectorAll(
    '.ux-image-carousel-item img, .ux-image-carousel img, [data-testid="ux-image-carousel"] img, .ux-image-filmstrip-carousel img, .ux-image-grid img, #icImg'
  ).forEach((img) => {
    addImg(img.getAttribute('data-zoom-src'));
    addImg(img.getAttribute('data-src'));
    addImg(img.currentSrc || img.src);
    (img.getAttribute('srcset') || '').split(',').forEach((p) => addImg(p.trim().split(' ')[0]));
  });
  if (ld && ld.image) [].concat(ld.image).forEach((i) => addImg(typeof i === 'string' ? i : i && (i.url || i.contentUrl)));
  if (!imgs.size) {
    const og = document.querySelector('meta[property="og:image"]');
    if (og) addImg(og.content);
  }
  out.images = [...imgs.values()];

  // ---- Breadcrumbs (eBay category path) ----
  document.querySelectorAll('nav.breadcrumbs a, .breadcrumbs a, [data-testid="x-breadcrumb"] a, .seo-breadcrumbs-container a').forEach((a) => {
    const t = txt(a);
    if (t && !/^back to/i.test(t) && !out.breadcrumbs.includes(t)) out.breadcrumbs.push(t);
  });

  // ---- Description (lives in a separate iframe page; the panel fetches it) ----
  const ifr = document.querySelector('#desc_ifr, iframe[src*="ebaydesc.com"]');
  out.descUrl = ifr ? ifr.src : '';
  out.descriptionInline = txt(document.querySelector('[data-testid="x-item-description-child"], .x-item-description-child'));
  if (!out.descUrl && out.itemId) {
    out.descUrl = 'https://vi.vipr.ebaydesc.com/ws/eBayISAPI.dll?ViewItemDescV4&item=' + out.itemId;
  }

  return out;
}

// "Ask Claude" round trip, no API key:
// 1. The panel copies a prompt (eBay data + every site's real option lists).
// 2. You paste it into a Claude chat (claude.ai or Claude Code) with the photos.
// 3. You paste Claude's JSON answer back into the panel. It fills every field.

function optionBlock(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}: ${v.join(' | ')}`).join('\n');
}

function buildPrompt(item, photoInfo) {
  const specifics = Object.entries(item.specifics || {}).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  const desc = (item.descriptionClean || '').slice(0, 2500);
  const depopAttrs = Object.entries(DEPOP_OPTIONS.attributes)
    .map(([k, a]) => `${k} [shown for ${a.when}]: ${a.options.join(' | ')}`).join('\n');

  return `I'm cross-listing an item I own from eBay to Depop, Poshmark and Mercari. Fill in every field for each site.

PHOTOS
${photoInfo}
Look closely at every photo: brand tag, size tag, material tag (fabric %), country of origin, color, pattern, wash, fit, cut, logos, and any flaws (stains, holes, pilling, fading). Measurements if a tape is visible.

EBAY LISTING
Title: ${item.title}
Price: ${item.price} ${item.currency || ''}
Condition: ${item.condition}${item.conditionNotes ? ' – ' + item.conditionNotes : ''}
eBay category: ${(item.breadcrumbs || []).join(' > ')}
Item specifics:
${specifics || '(none)'}
Description:
${desc || '(none)'}

RULES
1. For every field that has an option list below, copy one option EXACTLY as written. Use "" if nothing fits. Never invent options.
2. Don't make up facts. If a photo and the eBay data disagree, trust the photo (for example the size tag) and say so in "notes".
3. Titles: max 80 characters. Brand + item type + key details (color, style, fit) + size.
4. Descriptions: plain text, friendly, honest about any flaws, never mention eBay.
   - Depop: max 1000 characters. The first line is a short title. End with up to 5 hashtags.
   - Poshmark: max 1500 characters. Mercari: max 1000 characters.
   - Include size, measurements (if known), material and condition details.
5. Prices: use the eBay price unless the item is clearly worth a different price on that site.
6. "sku": use "${item.sku}".

Reply with ONLY one JSON code block, in exactly this shape:
\`\`\`json
{
  "notes": "anything I should double-check (wrong size on eBay, flaws seen in photos, etc.)",
  "depop": {
    "description": "", "category": "Dept > Group > Subcategory", "brand": "", "condition": "",
    "size": "", "colors": ["up to 2"], "type": "", "fit": "", "body_fit": "", "length": "",
    "material": ["up to 3"], "occasion": ["up to 3"], "source": ["up to 2"], "age": "",
    "styles": ["up to 3"], "price": "", "package_size": "", "sku": ""
  },
  "poshmark": {
    "title": "", "description": "", "category": "Dept > Category", "subcategory": "",
    "size": "", "condition": "", "brand": "", "colors": ["up to 2"], "style_tags": ["up to 3, free text"],
    "original_price": "retail price when new, or empty", "price": "", "sku": ""
  },
  "mercari": {
    "title": "", "description": "", "category": "Dept > Category > Subcategory (best guess)",
    "brand": "", "condition": "", "size": "", "color": "", "price": ""
  }
}
\`\`\`

===== DEPOP OPTIONS =====
Categories ("Dept > Group: subcategories"):
${optionBlock(DEPOP_OPTIONS.categories)}
Condition: ${DEPOP_OPTIONS.conditions.join(' | ')}
Colors: ${DEPOP_OPTIONS.colors.join(' | ')}
Source: ${DEPOP_OPTIONS.sources.join(' | ')}
Age: ${DEPOP_OPTIONS.ages.join(' | ')}
Styles: ${DEPOP_OPTIONS.styles.join(' | ')}
Package size: ${DEPOP_OPTIONS.packageSizes.join(' | ')} (${DEPOP_OPTIONS.packageHint})
Extra fields (put the "Type" answer in "type", whichever kind applies):
${depopAttrs}
Sizes look like: ${Object.entries(DEPOP_OPTIONS.sizeHints).map(([k, v]) => `${k}: ${v}`).join('; ')}. Waist sizes are written like 32".

===== POSHMARK OPTIONS =====
Categories ("Dept > Category: subcategories"):
${optionBlock(POSHMARK_OPTIONS.categories)}
${POSHMARK_OPTIONS.otherDepartments}
Condition: ${POSHMARK_OPTIONS.conditions.join(' | ')}
Colors: ${POSHMARK_OPTIONS.colors.join(' | ')}
Sizes look like: ${Object.entries(POSHMARK_OPTIONS.sizeHints).map(([k, v]) => `${k}: ${v}`).join('; ')}. Men's jeans/pants sizes are written like "Waist 32".

===== MERCARI OPTIONS =====
Condition: ${MERCARI_OPTIONS.conditions.join(' | ')}
Colors: ${MERCARI_OPTIONS.colors.join(' | ')}
`;
}

function parseClaudeAnswer(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON found. Paste Claude\'s whole reply.');
  let json = text.slice(start, end + 1);
  try {
    return JSON.parse(json);
  } catch (e) {
    // Common chat slip-ups: trailing commas, smart quotes
    json = json.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');
    return JSON.parse(json);
  }
}

// Claude's answer -> panel field values (same keys the panel and filler use)
function answerToEdits(a) {
  const j = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : v == null ? '' : String(v));
  const out = { depop: {}, poshmark: {}, mercari: {} };
  // Skip template text Claude may echo back ("up to 2", "Dept > Category"...)
  const placeholder = /^(up to \d|retail price when new|dept > |anything i should|best guess)/i;
  const put = (site, key, v) => { const s = j(v).trim(); if (s && !placeholder.test(s)) out[site][key] = s; };
  const d = a.depop || {};
  put('depop', 'description', d.description); put('depop', 'category', d.category); put('depop', 'brand', d.brand);
  put('depop', 'condition', d.condition); put('depop', 'size', d.size); put('depop', 'color', d.colors);
  put('depop', 'attr_type', d.type); put('depop', 'attr_fit', d.fit); put('depop', 'attr_bodyfit', d.body_fit);
  put('depop', 'attr_length', d.length); put('depop', 'material', d.material); put('depop', 'occasion', d.occasion);
  put('depop', 'source', d.source); put('depop', 'age', d.age); put('depop', 'style', d.styles);
  put('depop', 'price', d.price); put('depop', 'package', d.package_size); put('depop', 'sku', d.sku);
  const p = a.poshmark || {};
  put('poshmark', 'title', p.title); put('poshmark', 'description', p.description); put('poshmark', 'category', p.category);
  put('poshmark', 'subcategory', p.subcategory); put('poshmark', 'size', p.size); put('poshmark', 'condition', p.condition);
  put('poshmark', 'brand', p.brand); put('poshmark', 'color', p.colors); put('poshmark', 'styleTags', p.style_tags);
  put('poshmark', 'originalPrice', p.original_price); put('poshmark', 'price', p.price); put('poshmark', 'sku', p.sku);
  const m = a.mercari || {};
  put('mercari', 'title', m.title); put('mercari', 'description', m.description); put('mercari', 'category', m.category);
  put('mercari', 'brand', m.brand); put('mercari', 'condition', m.condition); put('mercari', 'size', m.size);
  put('mercari', 'color', m.color); put('mercari', 'price', m.price);
  return out;
}

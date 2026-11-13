// =====================================================================
// Marketplace rules. If a site changes its form (new condition names,
// new colors, new limits), edit the values in this file.
// =====================================================================

const PLATFORMS = {
  depop: {
    name: 'Depop',
    sellUrl: 'https://www.depop.com/products/create/',
    maxPhotos: 8,
    descLimit: 1000,
    maxHashtags: 5,
    maxColors: 2,
    maxStyles: 3,
    conditions: ['Brand new', 'Like new', 'Used - Excellent', 'Used - Good', 'Used - Fair'],
    colors: ['Black', 'Grey', 'White', 'Cream', 'Tan', 'Brown', 'Red', 'Burgundy', 'Orange', 'Yellow',
      'Green', 'Khaki', 'Blue', 'Navy', 'Purple', 'Pink', 'Gold', 'Silver', 'Multi'],
    sources: ['Vintage', 'Preloved', 'Reworked / Upcycled', 'Custom', 'Handmade', 'Deadstock', 'Designer', 'Repaired'],
    ages: ['Modern', '00s', '90s', '80s', '70s', '60s', '50s', 'Antique'],
    styles: ['Streetwear', 'Sportswear', 'Loungewear', 'Goth', 'Retro', 'Boho', 'Western', 'Indie', 'Skater',
      'Cute', 'Chic', 'Rave', 'Pastel', 'Bright', 'Costume', 'Cosplay', 'Grunge', 'Party', 'Funky', 'Emo',
      'Minimalist', 'Preppy', 'Avant Garde', 'Punk', 'Glam', 'Casual', 'Coquette', 'Y2K', 'Utility', 'Workwear', 'Biker', 'Coastal'],
    dept: { men: 'Menswear', women: 'Womenswear', kids: 'Kids', unisex: 'Menswear (unisex)' },
  },
  poshmark: {
    name: 'Poshmark',
    sellUrl: 'https://poshmark.com/create-listing',
    maxPhotos: 16,
    titleLimit: 80,
    descLimit: 1500,
    maxColors: 2,
    maxStyles: 3,
    conditions: ['New With Tags', 'New Without Tags', 'Like New', 'Good', 'Fair'],
    colors: ['Red', 'Pink', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Gold', 'Silver', 'Black', 'Gray',
      'White', 'Cream', 'Brown', 'Tan'],
    dept: { men: 'Men', women: 'Women', kids: 'Kids', unisex: 'Men (unisex)' },
  },
  mercari: {
    name: 'Mercari',
    sellUrl: 'https://www.mercari.com/sell/',
    maxPhotos: 12,
    titleLimit: 80,
    descLimit: 1000,
    maxColors: 1,
    conditions: ['New', 'Like new', 'Good', 'Fair', 'Poor'],
    colors: ['Black', 'Gray', 'White', 'Beige', 'Red', 'Pink', 'Purple', 'Blue', 'Green', 'Yellow', 'Orange',
      'Brown', 'Gold', 'Silver'],
    dept: { men: 'Men', women: 'Women', kids: 'Kids', unisex: 'Men (unisex)' },
  },
};

// ---------- Condition ----------
// eBay condition text -> one internal grade -> each site's option.
function conditionGrade(text) {
  const s = (text || '').toLowerCase();
  if (/new with tags|new with box|brand new|new in box/.test(s)) return 'nwt';
  if (/new without tags|new without box|new \(other\)|new other|open box/.test(s)) return 'nwot';
  if (/new with defects/.test(s)) return 'newdefects';
  if (/excellent|very good|like new|mint/.test(s)) return 'excellent';
  if (/good/.test(s)) return 'good';
  if (/fair|acceptable/.test(s)) return 'fair';
  if (/parts|not working|poor/.test(s)) return 'poor';
  if (/^new/.test(s)) return 'nwt';
  if (/pre-?owned|used/.test(s)) return 'good';
  return '';
}

const CONDITION_MAP = {
  //            Depop               Poshmark            Mercari
  nwt:        { depop: 'Brand new',        poshmark: 'New With Tags',    mercari: 'New' },
  nwot:       { depop: 'Brand new',        poshmark: 'New Without Tags', mercari: 'New' },
  newdefects: { depop: 'Used - Excellent', poshmark: 'Good',             mercari: 'Good' },
  excellent:  { depop: 'Used - Excellent', poshmark: 'Like New',         mercari: 'Like new' },
  good:       { depop: 'Used - Good',      poshmark: 'Good',             mercari: 'Good' },
  fair:       { depop: 'Used - Fair',      poshmark: 'Fair',             mercari: 'Fair' },
  poor:       { depop: 'Used - Fair',      poshmark: 'Fair',             mercari: 'Poor' },
};

// ---------- Color ----------
// Any color word -> a basic color -> each site's option.
const COLOR_WORDS = {
  black: 'black', charcoal: 'gray', gray: 'gray', grey: 'gray', heather: 'gray', slate: 'gray',
  white: 'white', ivory: 'cream', cream: 'cream', 'off-white': 'cream', offwhite: 'cream', beige: 'beige',
  ecru: 'cream', tan: 'tan', camel: 'tan', khaki: 'khaki', sand: 'tan', taupe: 'tan', nude: 'beige',
  brown: 'brown', chocolate: 'brown', coffee: 'brown', mocha: 'brown', rust: 'orange',
  red: 'red', maroon: 'burgundy', burgundy: 'burgundy', wine: 'burgundy', crimson: 'red', scarlet: 'red',
  orange: 'orange', coral: 'orange', peach: 'orange', yellow: 'yellow', mustard: 'yellow', gold: 'gold',
  green: 'green', olive: 'olive', sage: 'green', mint: 'green', forest: 'green', teal: 'green', lime: 'green',
  blue: 'blue', navy: 'navy', denim: 'blue', indigo: 'navy', royal: 'blue', aqua: 'blue', turquoise: 'blue',
  cobalt: 'blue', sky: 'blue', purple: 'purple', lavender: 'purple', lilac: 'purple', violet: 'purple', plum: 'purple',
  pink: 'pink', magenta: 'pink', fuchsia: 'pink', rose: 'pink', blush: 'pink', silver: 'silver',
  multicolor: 'multi', multicolored: 'multi', multi: 'multi', rainbow: 'multi', 'tie dye': 'multi', 'tie-dye': 'multi',
};

const COLOR_MAP = {
  //         Depop        Poshmark   Mercari
  black:   ['Black',     'Black',   'Black'],
  gray:    ['Grey',      'Gray',    'Gray'],
  white:   ['White',     'White',   'White'],
  cream:   ['Cream',     'Cream',   'Beige'],
  beige:   ['Cream',     'Cream',   'Beige'],
  tan:     ['Tan',       'Tan',     'Beige'],
  khaki:   ['Khaki',     'Tan',     'Beige'],
  brown:   ['Brown',     'Brown',   'Brown'],
  red:     ['Red',       'Red',     'Red'],
  burgundy:['Burgundy',  'Red',     'Red'],
  orange:  ['Orange',    'Orange',  'Orange'],
  yellow:  ['Yellow',    'Yellow',  'Yellow'],
  gold:    ['Gold',      'Gold',    'Gold'],
  green:   ['Green',     'Green',   'Green'],
  olive:   ['Khaki',     'Green',   'Green'],
  blue:    ['Blue',      'Blue',    'Blue'],
  navy:    ['Navy',      'Blue',    'Blue'],
  purple:  ['Purple',    'Purple',  'Purple'],
  pink:    ['Pink',      'Pink',    'Pink'],
  silver:  ['Silver',    'Silver',  'Silver'],
  multi:   ['Multi',     '',        ''],
};
const COLOR_INDEX = { depop: 0, poshmark: 1, mercari: 2 };

function baseColors(ebayColor) {
  const found = [];
  const s = (ebayColor || '').toLowerCase();
  // Check longer words first so "off-white" wins over "white"
  Object.keys(COLOR_WORDS).sort((a, b) => b.length - a.length).forEach((w) => {
    const re = new RegExp('(^|[^a-z])' + w.replace('-', '\\-') + '($|[^a-z])');
    if (re.test(s)) {
      const c = COLOR_WORDS[w];
      if (!found.some((f) => f.c === c)) found.push({ c, at: s.search(re) });
    }
  });
  return found.sort((a, b) => a.at - b.at).map((f) => f.c).filter((c, i, a) => a.indexOf(c) === i);
}

function platformColors(pid, ebayColor) {
  const max = PLATFORMS[pid].maxColors;
  const out = [];
  baseColors(ebayColor).forEach((c) => {
    const v = (COLOR_MAP[c] || [])[COLOR_INDEX[pid]];
    if (v && !out.includes(v)) out.push(v);
  });
  return out.slice(0, max);
}

// ---------- Category ----------
// First rule whose pattern matches eBay's Type / Style / category path wins.
const CATEGORY_RULES = [
  [/sneaker|trainer|running shoe|athletic shoe/, 'Shoes', 'Sneakers'],
  [/boot/, 'Shoes', 'Boots'],
  [/sandal|slide|flip.?flop/, 'Shoes', 'Sandals'],
  [/heel|pump|stiletto/, 'Shoes', 'Heels'],
  [/loafer|oxford|dress shoe|derby|moccasin|flat/, 'Shoes', 'Loafers / Dress shoes'],
  [/shoe|cleat/, 'Shoes', 'Other shoes'],
  [/hoodie|sweatshirt|crewneck|pullover/, 'Tops', 'Hoodies & Sweatshirts'],
  [/sweater|cardigan|jumper|knit/, 'Tops', 'Sweaters & Cardigans'],
  [/jacket|coat|parka|windbreaker|bomber|puffer|anorak|fleece/, 'Outerwear', 'Jackets & Coats'],
  [/vest|gilet/, 'Outerwear', 'Vests'],
  [/blazer|suit|sport coat/, 'Suits & Blazers', 'Blazers / Suits'],
  [/polo/, 'Tops', 'Polos'],
  [/tank|cami/, 'Tops', 'Tank tops'],
  [/jersey/, 'Tops', 'Jerseys'],
  [/t-?shirt|tee\b|graphic/, 'Tops', 'T-shirts'],
  [/button|dress shirt|flannel|oxford shirt|casual shirt|shirt/, 'Tops', 'Shirts / Button-ups'],
  [/blouse|top/, 'Tops', 'Tops & Blouses'],
  [/jean|denim pant/, 'Bottoms', 'Jeans'],
  [/short/, 'Bottoms', 'Shorts'],
  [/legging/, 'Bottoms', 'Leggings'],
  [/jogger|sweatpant|track pant/, 'Bottoms', 'Sweatpants & Joggers'],
  [/pant|trouser|chino|cargo|slack/, 'Bottoms', 'Pants'],
  [/skirt/, 'Bottoms', 'Skirts'],
  [/dress|gown/, 'Dresses', 'Dresses'],
  [/jumpsuit|romper|overall/, 'One-pieces', 'Jumpsuits & Rompers'],
  [/swim|bikini|trunks/, 'Swimwear', 'Swimwear'],
  [/pajama|sleep|robe|lounge/, 'Sleepwear', 'Sleep & Lounge'],
  [/backpack/, 'Bags', 'Backpacks'],
  [/bag|purse|tote|handbag|wallet|clutch/, 'Bags', 'Bags & Wallets'],
  [/hat|cap|beanie|bucket/, 'Accessories', 'Hats'],
  [/belt/, 'Accessories', 'Belts'],
  [/sunglass|eyewear/, 'Accessories', 'Sunglasses'],
  [/watch/, 'Accessories', 'Watches'],
  [/necklace|ring|bracelet|earring|jewel|pendant/, 'Jewelry', 'Jewelry'],
  [/scarf|glove|sock|tie\b|bandana/, 'Accessories', 'Other accessories'],
];

function departmentKey(dept, crumbs) {
  const s = ((dept || '') + ' ' + (crumbs || []).join(' ')).toLowerCase();
  if (/\b(boys?|girls?|kids?|baby|toddler|youth|infant)\b/.test(s)) return 'kids';
  if (/\bunisex\b/.test(s) && !/\b(women|men)\b/.test((dept || '').toLowerCase())) return 'unisex';
  if (/\bwomen/.test(s)) return 'women';
  if (/\bmen/.test(s)) return 'men';
  return '';
}

function suggestCategory(pid, item) {
  const p = PLATFORMS[pid];
  const d = departmentKey(item.department, item.breadcrumbs);
  const hay = [item.type, item.style, item.title, ...(item.breadcrumbs || []).slice(-2)].join(' ').toLowerCase();
  const rule = CATEGORY_RULES.find(([re]) => re.test(hay));
  const parts = [];
  parts.push(d ? p.dept[d] : '(pick Men / Women / Kids)');
  if (rule) {
    let group = rule[1];
    if (pid === 'poshmark' && group === 'Tops' && d === 'men') group = 'Shirts';
    parts.push(group, rule[2]);
  }
  return parts.join(' › ');
}

// ---------- Depop extras ----------
function depopAge(item) {
  const s = [item.decade, item.era, item.vintage, item.title].join(' ').toLowerCase();
  const m = s.match(/\b(19[5-9]0|20[0-1]0)s?\b|\b([5-9]0)'?s\b|\by2k\b/);
  if (/y2k|\b2000s?\b|\b00s\b/.test(s)) return '00s';
  if (m) {
    const dec = m[1] ? m[1].slice(2, 4) : m[2];
    if (dec === '10') return 'Modern';
    return dec + 's';
  }
  if (/yes/.test((item.vintage || '').toLowerCase())) return '(vintage – pick decade)';
  return 'Modern';
}

function depopSource(item) {
  const vintage = /yes/i.test(item.vintage || '') || /\bvintage\b/i.test(item.title);
  const g = conditionGrade(item.condition);
  if (vintage && g === 'nwt') return 'Deadstock';
  if (vintage) return 'Vintage';
  if (/handmade/i.test([item.features, item.title].join(' '))) return 'Handmade';
  if (g === 'nwt' || g === 'nwot') return '';
  return 'Preloved';
}

function depopStyles(item) {
  const s = [item.style, item.theme, item.occasion, item.title, item.features].join(' ').toLowerCase();
  const hits = [];
  const add = (re, v) => { if (re.test(s) && !hits.includes(v)) hits.push(v); };
  add(/streetwear|street/, 'Streetwear');
  add(/athletic|sport|activewear|gym|running/, 'Sportswear');
  add(/lounge/, 'Loungewear');
  add(/goth/, 'Goth');
  add(/retro|throwback/, 'Retro');
  add(/boho|bohemian|hippie/, 'Boho');
  add(/western|cowboy|rodeo/, 'Western');
  add(/skate/, 'Skater');
  add(/grunge/, 'Grunge');
  add(/punk/, 'Punk');
  add(/emo/, 'Emo');
  add(/preppy|collegiate/, 'Preppy');
  add(/minimal/, 'Minimalist');
  add(/party|club/, 'Party');
  add(/rave|festival/, 'Rave');
  add(/y2k/, 'Y2K');
  add(/workwear|carhartt|dickies/, 'Workwear');
  add(/utility|cargo|military/, 'Utility');
  add(/biker|moto/, 'Biker');
  add(/casual|everyday/, 'Casual');
  return hits.slice(0, PLATFORMS.depop.maxStyles);
}

function hashtags(item, max) {
  const words = [];
  const push = (w) => {
    const t = (w || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (t && t.length > 1 && t.length < 25 && !words.includes(t) && !/^(na|none|doesnotapply|unbranded)$/.test(t)) words.push(t);
  };
  push(item.brand);
  if (/yes/i.test(item.vintage || '') || /vintage/i.test(item.title)) push('vintage');
  push(item.type);
  (item.style || '').split(/[,/]/).forEach(push);
  push(item.theme);
  push(item.pattern);
  push(item.character);
  return words.slice(0, max).map((w) => '#' + w);
}

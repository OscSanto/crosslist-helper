// =====================================================================
// Rule-based guesses (used before / without the AI step).
// The real option lists live in site-options.js.
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
    conditions: DEPOP_OPTIONS.conditions,
    colors: DEPOP_OPTIONS.colors,
    sources: DEPOP_OPTIONS.sources,
    ages: DEPOP_OPTIONS.ages,
    styles: DEPOP_OPTIONS.styles,
  },
  poshmark: {
    name: 'Poshmark',
    sellUrl: 'https://poshmark.com/create-listing',
    maxPhotos: 16,
    titleLimit: 80,
    descLimit: 1500,
    maxColors: 2,
    maxStyles: 3,
    conditions: POSHMARK_OPTIONS.conditions,
    colors: POSHMARK_OPTIONS.colors,
  },
  mercari: {
    name: 'Mercari',
    sellUrl: 'https://www.mercari.com/sell/',
    maxPhotos: 12,
    titleLimit: 80,
    descLimit: 1000,
    maxColors: 1,
    conditions: MERCARI_OPTIONS.conditions,
    colors: MERCARI_OPTIONS.colors,
  },
};

// ---------- Condition ----------
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
  nwt:        { depop: 'Brand new',        poshmark: 'New With Tags (NWT)', mercari: 'New' },
  nwot:       { depop: 'Brand new',        poshmark: 'Like New',            mercari: 'New' },
  newdefects: { depop: 'Used - Excellent', poshmark: 'Good',                mercari: 'Good' },
  excellent:  { depop: 'Used - Excellent', poshmark: 'Like New',            mercari: 'Like new' },
  good:       { depop: 'Used - Good',      poshmark: 'Good',                mercari: 'Good' },
  fair:       { depop: 'Used - Fair',      poshmark: 'Fair',                mercari: 'Fair' },
  poor:       { depop: 'Used - Fair',      poshmark: 'Fair',                mercari: 'Poor' },
};

// ---------- Color ----------
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
  Object.keys(COLOR_WORDS).sort((a, b) => b.length - a.length).forEach((w) => {
    const re = new RegExp('(^|[^a-z])' + w.replace('-', '\\-') + '($|[^a-z])');
    if (re.test(s)) {
      const c = COLOR_WORDS[w];
      if (!found.some((f) => f.c === c)) found.push({ c, at: s.search(re) });
    }
  });
  return found.sort((a, b) => a.at - b.at).map((f) => f.c);
}

function platformColors(pid, ebayColor) {
  const out = [];
  baseColors(ebayColor).forEach((c) => {
    const v = (COLOR_MAP[c] || [])[COLOR_INDEX[pid]];
    if (v && !out.includes(v)) out.push(v);
  });
  return out.slice(0, PLATFORMS[pid].maxColors);
}

// ---------- Category ----------
// [pattern, Depop group, Depop sub, Poshmark men [cat, sub], Poshmark women [cat, sub]]
const CATEGORY_RULES = [
  [/sneaker|trainer|running shoe|athletic shoe/, 'Footwear', 'Sneakers', ['Shoes', 'Sneakers'], ['Shoes', 'Sneakers']],
  [/boot/, 'Footwear', 'Boots', ['Shoes', 'Boots'], ['Shoes', 'Ankle Boots & Booties']],
  [/sandal|slide|flip.?flop/, 'Footwear', 'Sandals', ['Shoes', 'Sandals & Flip-Flops'], ['Shoes', 'Sandals']],
  [/loafer|moccasin|slip.?on/, 'Footwear', 'Loafers', ['Shoes', 'Loafers & Slip-Ons'], ['Shoes', 'Flats & Loafers']],
  [/oxford shoe|derby|dress shoe/, 'Footwear', 'Oxfords', ['Shoes', 'Oxfords & Derbys'], ['Shoes', 'Flats & Loafers']],
  [/heel|pump|stiletto/, 'Footwear', 'Pumps', ['Shoes', ''], ['Shoes', 'Heels']],
  [/hoodie/, 'Tops', 'Hoodies', ['Shirts', 'Sweatshirts & Hoodies'], ['Tops', 'Sweatshirts & Hoodies']],
  [/sweatshirt|crewneck sweatshirt|pullover/, 'Tops', 'Sweatshirts', ['Shirts', 'Sweatshirts & Hoodies'], ['Tops', 'Sweatshirts & Hoodies']],
  [/cardigan/, 'Tops', 'Cardigans', ['Sweaters', 'Cardigan'], ['Sweaters', 'Cardigans']],
  [/sweater|jumper|knit/, 'Tops', 'Sweaters', ['Sweaters', 'Crewneck'], ['Sweaters', 'Crew & Scoop Necks']],
  [/blazer|sport coat|suit jacket/, 'Suits', 'Tailored jackets', ['Suits & Blazers', 'Sport Coats & Blazers'], ['Jackets & Coats', 'Blazers & Suit Jackets']],
  [/\bvest\b|gilet/, 'Coats and jackets', 'Vests', ['Jackets & Coats', 'Vests'], ['Jackets & Coats', 'Vests']],
  [/\bcoat\b|parka|trench|overcoat/, 'Coats and jackets', 'Coats', ['Jackets & Coats', ''], ['Jackets & Coats', '']],
  [/jacket|windbreaker|bomber|puffer|anorak|fleece|shacket/, 'Coats and jackets', 'Jackets', ['Jackets & Coats', ''], ['Jackets & Coats', '']],
  [/polo/, 'Tops', 'Polo shirts', ['Shirts', 'Polos'], ['Tops', '']],
  [/jersey/, 'Tops', 'Jerseys', ['Shirts', 'Jerseys'], ['Tops', 'Jerseys']],
  [/tank|cami/, 'Tops', 'Tank tops and camis', ['Shirts', 'Tank Tops'], ['Tops', 'Tank Tops']],
  [/long sleeve t|long sleeve tee/, 'Tops', 'T-shirts', ['Shirts', 'Tees - Long Sleeve'], ['Tops', 'Tees - Long Sleeve']],
  [/t-?shirt|\btee\b|graphic/, 'Tops', 'T-shirts', ['Shirts', 'Tees - Short Sleeve'], ['Tops', 'Tees - Short Sleeve']],
  [/blouse/, 'Tops', 'Blouses', ['Shirts', ''], ['Tops', 'Blouses']],
  [/button|flannel|dress shirt|\bshirt\b/, 'Tops', 'Shirts', ['Shirts', 'Casual Button Down Shirts'], ['Tops', 'Button Down Shirts']],
  [/overall/, 'Jumpsuits and rompers', 'Overalls', ['Jeans', ''], ['Jeans', 'Overalls']],
  [/jumpsuit|romper/, 'Jumpsuits and rompers', 'Jumpsuits', ['Pants', ''], ['Pants & Jumpsuits', 'Jumpsuits & Rompers']],
  [/jean|denim pant/, 'Bottoms', 'Jeans', ['Jeans', ''], ['Jeans', '']],
  [/short/, 'Bottoms', 'Shorts', ['Shorts', ''], ['Shorts', '']],
  [/legging/, 'Bottoms', 'Leggings', ['Pants', ''], ['Pants & Jumpsuits', 'Leggings']],
  [/jogger|sweatpant|track pant/, 'Bottoms', 'Sweatpants', ['Pants', 'Sweatpants & Joggers'], ['Pants & Jumpsuits', 'Track Pants & Joggers']],
  [/cargo/, 'Bottoms', 'Pants', ['Pants', 'Cargo'], ['Pants & Jumpsuits', '']],
  [/chino|khaki/, 'Bottoms', 'Pants', ['Pants', 'Chinos & Khakis'], ['Pants & Jumpsuits', 'Trousers']],
  [/corduroy pant|cords/, 'Bottoms', 'Pants', ['Pants', 'Corduroy'], ['Pants & Jumpsuits', 'Trousers']],
  [/pant|trouser|slack/, 'Bottoms', 'Pants', ['Pants', ''], ['Pants & Jumpsuits', 'Trousers']],
  [/skirt/, 'Bottoms', 'Skirts', ['Other', ''], ['Skirts', '']],
  [/dress/, 'Dresses', 'Casual dresses', ['Other', ''], ['Dresses', '']],
  [/swim|bikini|trunks/, 'Swimwear', 'Other', ['Swim', 'Swim Trunks'], ['Swim', '']],
  [/pajama|sleep|robe/, 'Sleepwear', 'Pajamas', ['Other', ''], ['Intimates & Sleepwear', 'Pajamas']],
  [/backpack/, 'Accessories', 'Bags', ['Bags', 'Backpacks'], ['Bags', 'Backpacks']],
  [/wallet|card ?holder/, 'Accessories', 'Wallets and cardholders', ['Bags', 'Wallets'], ['Bags', 'Wallets']],
  [/bag|purse|tote|handbag|clutch/, 'Accessories', 'Bags', ['Bags', ''], ['Bags', '']],
  [/\bhat\b|\bcap\b|beanie|bucket hat/, 'Accessories', 'Hats and caps', ['Accessories', 'Hats'], ['Accessories', 'Hats']],
  [/belt/, 'Accessories', 'Belts', ['Accessories', 'Belts'], ['Accessories', 'Belts']],
  [/sunglass/, 'Accessories', 'Sunglasses', ['Accessories', 'Sunglasses'], ['Accessories', 'Sunglasses']],
  [/watch/, 'Accessories', 'Watches', ['Accessories', 'Watches'], ['Accessories', 'Watches']],
  [/necklace|\bring\b|bracelet|earring|jewel|pendant/, 'Accessories', 'Jewelry', ['Accessories', 'Jewelry'], ['Jewelry', '']],
  [/scarf|scarves/, 'Accessories', 'Scarves and wraps', ['Accessories', 'Scarves'], ['Accessories', 'Scarves & Wraps']],
];

const KIDS_POSH = { Tops: 'Shirts & Tops', Bottoms: 'Bottoms', 'Coats and jackets': 'Jackets & Coats', Footwear: 'Shoes', Dresses: 'Dresses', Accessories: 'Accessories', Swimwear: 'Swim', Sleepwear: 'Pajamas' };

function departmentKey(dept, crumbs) {
  const s = ((dept || '') + ' ' + (crumbs || []).join(' ')).toLowerCase();
  if (/\b(boys?|girls?|kids?|baby|toddler|youth|infant)\b/.test(s)) return 'kids';
  if (/\bwomen/.test(s)) return 'women';
  if (/\bmen/.test(s) || /\bunisex\b/.test(s)) return 'men';
  return '';
}

function categoryRule(item) {
  const hay = [item.type, item.style, item.title, ...(item.breadcrumbs || []).slice(-2)].join(' ').toLowerCase();
  return CATEGORY_RULES.find(([re]) => re.test(hay));
}

// Returns { category, subcategory } using each site's exact names.
function suggestCategory(pid, item) {
  const d = departmentKey(item.department, item.breadcrumbs);
  const D = { men: 'Men', women: 'Women', kids: 'Kids' }[d] || '';
  const rule = categoryRule(item);
  if (pid === 'depop') {
    if (!rule || !D) return { category: '', subcategory: '' };
    let [, group, sub] = rule;
    if (D === 'Men' && sub === 'Pumps') sub = 'Other';
    const path = `${D} > ${group}`;
    const list = DEPOP_OPTIONS.categories[path];
    if (!list) return { category: '', subcategory: '' };
    return { category: `${path} > ${list.includes(sub) ? sub : 'Other'}`, subcategory: '' };
  }
  if (pid === 'poshmark') {
    if (!D) return { category: '', subcategory: '' };
    if (!rule) return { category: `${D} > Other`, subcategory: '' };
    if (D === 'Kids') return { category: `Kids > ${KIDS_POSH[rule[1]] || 'Other'}`, subcategory: '' };
    const [cat, sub] = D === 'Men' ? rule[3] : rule[4];
    return { category: `${D} > ${cat}`, subcategory: sub };
  }
  // Mercari: readable guess only
  if (!rule) return { category: D, subcategory: '' };
  return { category: [D, rule[1], rule[2]].filter(Boolean).join(' > '), subcategory: '' };
}

// ---------- Depop extras ----------
function depopAge(item) {
  const s = [item.decade, item.vintage, item.title].join(' ').toLowerCase();
  if (/y2k|\b2000s?\b|\b00s\b/.test(s)) return '00s';
  const m = s.match(/\b19([5-9])0s?\b|\b([5-9])0'?s\b/);
  if (m) return (m[1] || m[2]) + '0s';
  if (/yes/.test((item.vintage || '').toLowerCase())) return '';
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
  add(/rave|festival/, 'Rave');
  add(/y2k/, 'Y2K');
  add(/utility|cargo|military|workwear|carhartt|dickies/, 'Utility');
  add(/gorpcore|hiking|outdoor|patagonia|north face|arc'?teryx/, 'Gorpcore');
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

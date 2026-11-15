# Crosslist Helper

A Chrome extension. It reads an eBay listing, asks Claude (in your normal chat, no API key) to fill in every field for Depop, Poshmark and Mercari, and then fills in those sites' sell forms for you. You add the photos and click Post yourself.

## Install (one time)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder (`crosslist-helper`).
4. Click the puzzle-piece icon in the toolbar and pin **Crosslist Helper**.

After you change any file, click the reload arrow on the extension card in `chrome://extensions`, then reload any open Depop / Poshmark / Mercari tabs.

## Use

1. Open an eBay item page (`ebay.com/itm/...`).
2. Click the Crosslist Helper icon. A panel opens on the right.
3. Click **Extract from this eBay page**.
4. **Ask Claude** (eBay tab):
   1. Click **Copy prompt (and save photos)**. The photos are saved to `Downloads\Crosslist\<item number>\`.
   2. Paste the prompt into a Claude chat:
      - **claude.ai**: pick Haiku in the model menu and drag the photos into the message.
      - **Claude Code**: paste it as is. It opens the photos from the folder itself.
   3. Copy Claude's whole reply, paste it into the panel, and click **Use this answer**.
5. Open a site's sell page (the **Open … sell page** button on each tab).
6. A **Crosslist Helper** box appears in the bottom-right corner of the page:
   - **Fill everything** fills the whole form.
   - Or click into a field. A **✨ I know this** button appears; click it to fill only that field.
   - A ✗ means a field could not be filled. Hover it to see why, then fill that field by hand.
7. Photos: on each site's tab, drag the photos into the order you want. Only the first ones the site allows (8 on Depop) are kept; the faded ones are left out. Dropping a photo into a kept spot pushes the last kept photo out. **Download** saves them as `01.jpg`, `02.jpg`… in `Downloads\Crosslist\<item number>\<site>\`.
8. Drag the photos into the sell page, check everything, and post.

**Your own changes.** If you change or add a value on the sell page yourself, the corner box notices it and lists it under **You changed N fields here** (old value → new value). Untick anything you don't want, then click **Save my changes to Crosslist**. If you changed the title, description, brand, size, price or SKU, you can tick **Also use … on the other sites** to copy those to the other two sites too (titles and descriptions are cut to each site's limit). The box remembers that choice. Saved values get a **You** badge in the panel and win over both eBay and Claude. They are kept with that eBay item, so if you extract the same listing again later they come back. Edits you type in the panel are saved the same way. **Undo** next to a **You** badge goes back to the eBay/Claude value. (Poshmark style tags are not tracked.)

The panel's site tabs show every value, with **Copy** buttons and the site's real options. Fields Claude filled have an **AI** badge. You can edit anything.

## What you keep

Every tab has a **What you keep** card. It shows your payout on Depop, Poshmark, Mercari and eBay at the price set on each tab, and the fee breakdown for the current site. Set what the shipping label costs, whether the buyer pays shipping, and whether the Depop listing is boosted. The best payout is shown in green.

Fee rules (US, Nov 2026) are in `fees.js`: Depop 3.3% + $0.45 processing (+12% if boosted), Poshmark $2.95 under $15 or 20%, Mercari 10%, eBay 13.6% + $0.40 per order. Sales tax is left out. The sites change their fees often, so check their fee pages and edit `fees.js` when they do.

## What gets auto-filled

| Site | Auto-filled | By hand |
|---|---|---|
| Depop | description, category, brand, condition, size, colors, type, fit, body fit, length, material, occasion, SKU, source, age, style, price, package size | photos |
| Poshmark | title, description, category, subcategory, size, condition, brand, colors, style tags, listing SKU, listing price | photos; the price pop-up (Smart Sell, original price, then **Done**) |
| Mercari | title, description, brand, price | photos, category, condition, size, color, shipping (Mercari's form is not mapped yet) |

Each item gets a private **SKU** (`CL-` + the eBay item number) on Depop and Poshmark. It lets you find the same item on every site when it sells.

## Change the rules

- `site-options.js`: the real option lists from each site's form (categories, conditions, colors, styles, materials…). If a site renames an option, change it here.
- `mappings.js`: the rule-based guesses used before Claude answers.
- `ai.js`: the prompt sent to Claude and how the reply is read.
- `filler.js`: how each site's form is filled.

## Files

| File | What it does |
|---|---|
| `manifest.json` | Extension settings and permissions |
| `background.js` | Opens the side panel when you click the icon |
| `extractor.js` | Runs on the eBay page and reads title, price, condition, item specifics, photos, category path |
| `panel.html/css/js` | The side panel: tabs, Ask Claude, copy buttons, photo download |
| `site-options.js` | Depop / Poshmark / Mercari option lists |
| `mappings.js` | eBay → site conversion rules (fallback) |
| `fees.js` | Each site's fees, for the What you keep card |
| `ai.js` | Builds the Claude prompt and reads Claude's JSON reply |
| `filler.js` | Runs on the sell pages: the corner box and the auto-fill |

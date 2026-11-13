# Crosslist Helper

A Chrome extension. It reads an eBay listing and gets the details ready to copy into Depop, Poshmark and Mercari.

## Install (one time)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder (`crosslist-helper`).
4. Click the puzzle-piece icon in the toolbar and pin **Crosslist Helper**.

After you change any file, click the reload arrow on the extension card in `chrome://extensions`.

## Use

1. Open an eBay item page (`ebay.com/itm/...`).
2. Click the Crosslist Helper icon. A panel opens on the right.
3. Click **Extract from this eBay page**.
4. Use the tabs: **eBay** (everything that was found), **Depop**, **Poshmark**, **Mercari**.
5. On a site tab:
   - **Open … sell page** opens that site's listing form.
   - **Download N photos** saves the photos to `Downloads\Crosslist\<item number>\`. Drag them into the site's upload box.
   - Click **Copy** next to a field, then paste it into the matching box on the site.
   - For dropdown fields (condition, color, style…) the panel shows the site's options. The best match is highlighted. Click a different one to change it.
   - You can edit any field. Edits are saved. **Reset** undoes them.
6. With **auto-switch** on, the panel jumps to the matching tab when you switch to a Depop, Poshmark or Mercari browser tab.

The last item you extracted stays in the panel until you extract a new one.

## Change the rules

All site rules are in `mappings.js`: condition names, color lists, category guesses, Depop styles, character limits and photo limits. If a site renames an option, change it there.

## Files

| File | What it does |
|---|---|
| `manifest.json` | Extension settings and permissions |
| `background.js` | Opens the side panel when you click the icon |
| `extractor.js` | Runs on the eBay page and reads title, price, condition, item specifics, photos, category path |
| `panel.html/css/js` | The side panel: description download, tabs, copy buttons, photo download |
| `mappings.js` | eBay → Depop / Poshmark / Mercari conversion rules |

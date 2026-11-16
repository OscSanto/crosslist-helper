// Clicking the toolbar icon opens the side panel.
const enablePanel = () =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(enablePanel);
chrome.runtime.onStartup.addListener(enablePanel);
enablePanel();

// ---------------- photos for the sell pages ----------------
// The Depop page can't download eBay photos itself (the browser blocks
// cross-site reads), so filler.js asks here. We fetch the photo with the
// extension's eBay permission and send it back as base64.
// Depop only takes JPEG or PNG, so anything else (like WebP) is converted.
async function photoForPage(url) {
  const res = await fetch(url, { headers: { Accept: 'image/jpeg,image/png;q=0.9,*/*;q=0.5' } });
  if (!res.ok) throw new Error(`eBay photo ${res.status}`);
  let blob = await res.blob();
  if (!/^image\/(jpeg|png)$/.test(blob.type)) {
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(bin), type: blob.type };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== 'crosslist:photo') return;
  photoForPage(msg.url)
    .then((p) => reply({ ok: true, ...p }))
    .catch((e) => reply({ ok: false, error: e.message || String(e) }));
  return true; // reply comes later
});

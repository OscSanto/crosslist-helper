// What you keep from a sale on each site (US fees, as of Nov 2026).
// Fees change often. Check each site's fee page and edit the numbers here.
//
// Input: { price, ship, buyerPaysShip, boost }
//   price          item price you list at
//   ship           what the shipping label costs you
//   buyerPaysShip  true = the buyer pays shipping on top of the price
//   boost          Depop only: listing is boosted
// Output: { keep, lines: [[label, amount], ...], note }
const money = (n) => (n < 0 ? '−$' : '$') + Math.abs(n).toFixed(2);
const round2 = (n) => Math.round(n * 100) / 100;

const FEES = {
  depop: {
    name: 'Depop',
    calc({ price, ship, buyerPaysShip, boost }) {
      const buyerShip = buyerPaysShip ? ship : 0;
      const processing = round2(0.033 * (price + buyerShip) + 0.45);
      const boostFee = boost ? round2(0.12 * price) : 0;
      const label = buyerPaysShip ? 0 : ship;
      const lines = [['Payment processing (3.3% + $0.45)', -processing]];
      if (boost) lines.push(['Boost (12%)', -boostFee]);
      if (label) lines.push(['Shipping label (you pay)', -label]);
      return { keep: round2(price - processing - boostFee - label), lines, note: 'No selling fee in the US. Processing also applies to sales tax.' };
    },
  },
  poshmark: {
    name: 'Poshmark',
    calc({ price }) {
      const fee = price < 15 ? 2.95 : round2(0.2 * price);
      return {
        keep: round2(price - fee),
        lines: [[price < 15 ? 'Poshmark fee (flat, under $15)' : 'Poshmark fee (20%)', -fee]],
        note: 'The buyer pays Poshmark\'s flat shipping; you get a prepaid label.',
      };
    },
  },
  mercari: {
    name: 'Mercari',
    calc({ price, ship, buyerPaysShip }) {
      const buyerShip = buyerPaysShip ? ship : 0;
      const fee = round2(0.1 * (price + buyerShip));
      const label = buyerPaysShip ? 0 : ship;
      const lines = [['Selling fee (10%)', -fee]];
      if (label) lines.push(['Shipping label (you pay)', -label]);
      return { keep: round2(price - fee - label), lines, note: '10% includes buyer-paid shipping. No processing fee.' };
    },
  },
  ebay: {
    name: 'eBay',
    calc({ price, ship, buyerPaysShip }) {
      const buyerShip = buyerPaysShip ? ship : 0;
      const total = price + buyerShip;
      const fvf = round2(0.136 * total);
      const perOrder = total > 10 ? 0.4 : 0.3;
      const label = buyerPaysShip ? 0 : ship;
      const lines = [['Final value fee (13.6%)', -fvf], ['Per-order fee', -perOrder]];
      if (label) lines.push(['Shipping label (you pay)', -label]);
      return { keep: round2(price - fvf - perOrder - label), lines, note: 'Clothing rate. Fees also apply to sales tax. Promoted Listings not included.' };
    },
  },
};

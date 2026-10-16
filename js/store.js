/*
 * OGS Lifestyle — in-game store.
 *
 * Real-money purchases go through a payments adapter installed on
 * OGS.Payments, e.g. Google Play Billing in the Android build, or
 * Paystack/Flutterwave on the web. Its interface is:
 *   OGS.Payments.buy(productId) -> Promise<{ ok: boolean, receipt?: string }>
 * Without an adapter nothing is charged and nothing is granted.
 */
(function (root) {
  'use strict';
  const PRODUCTS = [
    { id: 'ise-owo-200k', name: 'Ise Owo Pack', price: '₦500', grant: 200000, blurb: '₦200,000 in-game cash to start your hustle.' },
    { id: 'ise-owo-1m', name: 'Ise Owo Big Pack', price: '₦2,000', grant: 1000000, blurb: '₦1,000,000 in-game cash.' },
    { id: 'remove-ads', name: 'Remove Ads', price: '₦1,000', removeAds: true, blurb: 'No more sponsor banners. Rewarded "double hustle" ads stay optional.' },
  ];

  const ADS_KEY = 'ogs-ads-removed';
  function adsRemoved() {
    try { return localStorage.getItem(ADS_KEY) === '1'; } catch (e) { return false; }
  }

  function available() {
    return !!(root.OGS && root.OGS.Payments && typeof root.OGS.Payments.buy === 'function');
  }

  async function purchase(s, productId) {
    const p = PRODUCTS.find((x) => x.id === productId);
    if (!p) return { ok: false, msg: 'Unknown product.' };
    if (!available()) return { ok: false, msg: 'Payments are not connected in this version yet. Nothing was charged.' };
    const r = await root.OGS.Payments.buy(productId);
    if (!r || !r.ok) return { ok: false, msg: 'Purchase cancelled.' };
    if (p.grant && s) { s.money += p.grant; root.OGS.Engine.log(s, `🛍️ ${p.name}: +${root.OGS.Engine.naira(p.grant)}.`, 'money'); }
    if (p.removeAds) { try { localStorage.setItem(ADS_KEY, '1'); } catch (e) { /* ignore */ } }
    return { ok: true, msg: `${p.name} purchased. Thank you!` };
  }

  const Store = { PRODUCTS, purchase, available, adsRemoved };
  if (typeof module === 'object' && module.exports) module.exports = Store;
  root.OGS = root.OGS || {};
  root.OGS.Store = Store;
})(typeof globalThis !== 'undefined' ? globalThis : this);

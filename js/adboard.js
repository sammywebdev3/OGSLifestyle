/*
 * OGS Lifestyle — Ads Board.
 *
 * Billboards that appear on the street (map), in "watch ad" breaks and in
 * the Today tab. Each ad runs between `start` and `end` (inclusive), so a
 * paid placement can have a minimum run time. In a live release this list
 * would come from a server where businesses book and pay for slots; for
 * now it is edited here. The entries below are SAMPLES, not real businesses.
 */
(function (root) {
  'use strict';
  const AdBoard = {
    contact: 'Want your business on OGS Lifestyle billboards? Contact the OGS Lifestyle team to book a slot.',
    ads: [
      { id: 'your-biz', business: 'Your Business Here', tagline: 'Advertise to thousands of players across Ogun State. Book a billboard!', lat: 7.141, lng: 3.359, where: 'Kuto', start: '2026-01-01', end: '2099-12-31', color: '#e8a317', sample: true },
      { id: 'sample-adire', business: 'Sample Adire Palace', tagline: 'Hand-dyed adire from Itoku. Wholesale & retail. (Sample ad)', lat: 7.158, lng: 3.341, where: 'Itoku', start: '2026-01-01', end: '2099-12-31', color: '#23408e', sample: true },
      { id: 'sample-phones', business: 'Sample Gateway Phones', tagline: 'Phones, chargers & accessories. Panseke junction. (Sample ad)', lat: 7.164, lng: 3.36, where: 'Panseke', start: '2026-01-01', end: '2099-12-31', color: '#0b6e4f', sample: true },
      { id: 'sample-ofada', business: 'Sample Mama Ofada Kitchen', tagline: 'Ofada rice, ayamase & lafun. Eat like a king! (Sample ad)', lat: 7.15, lng: 3.35, where: 'Ake', start: '2026-01-01', end: '2099-12-31', color: '#c0392b', sample: true },
    ],
    // Ads whose run includes the given real-world date.
    active(now = new Date()) {
      const day = now.toISOString().slice(0, 10);
      return this.ads.filter((a) => a.start <= day && day <= a.end);
    },
    random(now) {
      const list = this.active(now);
      return list[Math.floor(Math.random() * list.length)] || null;
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = AdBoard;
  root.OGS = root.OGS || {};
  root.OGS.AdBoard = AdBoard;
})(typeof globalThis !== 'undefined' ? globalThis : this);

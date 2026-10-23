/**
 * How sharply to render, and how far to zoom. Pure, unit-tested.
 *
 * The canvas is drawn at the device's pixel ratio (so text, outlines and painted detail are crisp
 * on phones) but capped: 2 at most, and 1.5 on phones that report few CPU cores or little memory,
 * where filling 4× the pixels would cost frame rate.
 */
export function renderScale(devicePixelRatio: number, cores?: number, memoryGb?: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const lowEnd = (cores !== undefined && cores <= 4) || (memoryGb !== undefined && memoryGb <= 3);
  return Math.max(1, Math.min(dpr, lowEnd ? 1.5 : 2));
}

/** Camera zoom in CSS pixels for a viewport this wide: a little closer on big screens. */
export function baseZoom(cssWidth: number): number {
  if (cssWidth < 640) return 1.05;
  if (cssWidth < 1100) return 1.2;
  return 1.3;
}

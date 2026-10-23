/**
 * One palette for the whole world, so characters, buildings, ground and props read as one set.
 * Warm late-afternoon light from the upper left: left-facing walls are lit, right-facing walls
 * are in shade, shadows fall to the lower right. Colours follow the brand (Ogun green, adire
 * indigo, laterite, palm gold, cream) and the red-earth streets of Abeokuta.
 */
export const PAL = {
  outline: '#2a1d1b',
  shadow: '#2b1a2e',
  ink: '#14151a',
  cream: '#fff6e5',
  laterite: '#c8693d',
  lateriteDark: '#a9532e',
  lateriteLight: '#d98257',
  grass: '#6cb34f',
  grassDark: '#4e9440',
  grassLight: '#8fcc5e',
  asphalt: '#3d3f49',
  asphaltLight: '#4a4c57',
  kerb: '#d8d2c4',
  paver: '#c2b8a6',
  paverDark: '#a99e8b',
  concrete: '#a39d92',
  drain: '#2f3b36',
  courtyard: '#e3d4b5',
  wood: '#7a4f2c',
  woodLight: '#a3703f',
  zinc: '#9aa3ad',
  glass: '#7cc7e8',
  glassDark: '#3d7fa6',
  frame: '#2d2a2e',
  ogun: '#12935a',
  adire: '#3a4fb0',
  palm: '#f2b632',
  red: '#d94b3a',
  /** Sun direction tint for lit faces / multiplier for shaded faces. */
  litAmount: 0.06,
  shadeAmount: -0.2,
} as const;

/** Canvas font stack for painted signs and labels (system fonts only: nothing to download). */
export const SIGN_FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';

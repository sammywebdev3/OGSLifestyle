/** Hex string → Phaser colour number. */
export const hex = (c: string) => parseInt(c.replace('#', ''), 16);

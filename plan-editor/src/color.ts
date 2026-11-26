/** Assombrit (amount < 0) ou éclaircit (amount > 0) une couleur hexadécimale. */
export function shade(hex: string, amount: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    const out = amount < 0 ? v * (1 + amount) : v + (255 - v) * amount;
    return Math.round(Math.min(255, Math.max(0, out)));
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/*
 * "Save print": the fingerprint with its tokens underneath, as a PNG sized for posting (1080 x 1350).
 * Drawn on a canvas from the same SVG the panel shows, so the image and the panel never disagree.
 */
import { fingerprintSvg, type PrintTier } from '../../src/lib/print/fingerprint';
import { durationLabel, type Tier } from '../../src/lib/print/tiers';

const W = 1080;
const H = 1350;
const PAPER = '#f7f6f3';
const INK = '#1b1b19';
const MUTED = '#6d6c66';

export async function savePrint(host: string, date: string, tiers: Tier[], print: PrintTier[]): Promise<void> {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  const svg = fingerprintSvg(print, { ink: INK, strokeWidth: 0.55 });
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const pw = 560;
  const ph = (pw * 120) / 100;
  ctx.drawImage(img, (W - pw) / 2, 72, pw, ph);

  const left = 96;
  let y = 72 + ph + 64;
  ctx.fillStyle = INK;
  ctx.font = '400 64px "Instrument Serif"';
  ctx.fillText(host, left, y);
  ctx.fillStyle = MUTED;
  ctx.font = '400 22px "JetBrains Mono"';
  ctx.textAlign = 'right';
  ctx.fillText(date, W - left, y);
  ctx.textAlign = 'left';
  y += 44;

  ctx.font = '400 20px "JetBrains Mono"';
  for (const t of tiers.slice(0, 6)) {
    ctx.fillStyle = INK;
    ctx.fillText(t.name, left, y);
    ctx.fillStyle = MUTED;
    const tf = t.timingFunction.length > 40 ? `${t.timingFunction.slice(0, 38)}…` : t.timingFunction;
    ctx.fillText(tf, left + 170, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.fillText(durationLabel(t.durationMs), W - left, y);
    ctx.textAlign = 'left';
    y += 34;
  }

  ctx.fillStyle = MUTED;
  ctx.font = '600 20px "Instrument Sans"';
  ctx.fillText('easeprint', left, H - 56);

  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${host}-easeprint-${date}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

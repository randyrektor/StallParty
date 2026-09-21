import { APP_NAME, APP_URL } from '../constants';
import { scoreShareTitle } from './scoreReport';

export const SCORE_OG_WIDTH = 1200;
export const SCORE_OG_HEIGHT = 630;

const FONT = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif`;

const COLORS = {
  bg: '#1d1d1d',
  card: '#2a2a2c',
  text: '#ffffff',
  muted: '#9aa0ab',
  open: '#3d8fff',
  women: '#ff3d9a',
};

/** Same washes as `.app-shell` in global.css: overlapping ellipses that fade out. */
const BLOBS: {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rgb: [number, number, number];
  fade: number;
}[] = [
  { x: 0.1, y: 0.08, rx: 560, ry: 360, rgb: [61, 143, 255], fade: 0.7 },
  { x: 0.24, y: 0.24, rx: 280, ry: 420, rgb: [61, 143, 255], fade: 0.72 },
  { x: 0.9, y: 0.2, rx: 420, ry: 560, rgb: [255, 61, 154], fade: 0.7 },
  { x: 0.76, y: 0.4, rx: 380, ry: 260, rgb: [255, 61, 154], fade: 0.72 },
  { x: 0.56, y: 0.8, rx: 540, ry: 340, rgb: [147, 51, 234], fade: 0.7 },
  { x: 0.7, y: 0.62, rx: 300, ry: 460, rgb: [147, 51, 234], fade: 0.72 },
];

const BLOB_ALPHA = 0.22;
const GRAIN_OPACITY = 0.08;

export function scoreOgFilename(
  team1Name: string,
  team2Name: string,
  team1Score: number,
  team2Score: number
): string {
  return `stallparty-${slug(team1Name)}-${team1Score}-${team2Score}-${slug(team2Name)}.png`;
}

function slug(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return cleaned || 'team';
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  weight = 600
): { text: string; size: number } {
  let size = maxSize;
  let display = text.trim() || 'Team';
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (size > minSize && ctx.measureText(display).width > maxWidth) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${FONT}`;
  }
  if (ctx.measureText(display).width > maxWidth) {
    while (display.length > 1 && ctx.measureText(`${display}…`).width > maxWidth) {
      display = display.slice(0, -1);
    }
    display = `${display}…`;
  }
  return { text: display, size };
}

function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  pathRoundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  pathRoundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

function fillSoftEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rgb: [number, number, number],
  fade: number
) {
  const [r, g, b] = rgb;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${BLOB_ALPHA})`);
  gradient.addColorStop(fade, `rgba(${r}, ${g}, ${b}, 0)`);
  if (fade < 1) gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function overlayGrain(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const size = 64;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tileCtx = tile.getContext('2d');
  if (!tileCtx) return;
  const pixels = tileCtx.createImageData(size, size);
  let seed = 0x9e3779b9;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const v = 70 + ((seed >>> 8) % 116);
    pixels.data[i] = v;
    pixels.data[i + 1] = v;
    pixels.data[i + 2] = v;
    pixels.data[i + 3] = 255;
  }
  tileCtx.putImageData(pixels, 0, 0);
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = GRAIN_OPACITY;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function drawScoreOgImage(
  ctx: CanvasRenderingContext2D,
  params: {
    team1Name: string;
    team2Name: string;
    team1Score: number;
    team2Score: number;
  }
): void {
  const w = SCORE_OG_WIDTH;
  const h = SCORE_OG_HEIGHT;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);

  for (const blob of BLOBS) {
    fillSoftEllipse(ctx, blob.x * w, blob.y * h, blob.rx, blob.ry, blob.rgb, blob.fade);
  }
  overlayGrain(ctx, w, h);

  ctx.fillStyle = COLORS.text;
  ctx.font = `800 72px ${FONT}`;
  ctx.fillText(APP_NAME, 72, 118);

  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText('Ultimate Frisbee score & line tracking', 74, 162);

  const cardY = 214;
  const cardH = 286;
  const cardGap = 36;
  const cardX = 72;
  const cardW = (w - cardX * 2 - cardGap) / 2;
  const teams = [
    {
      name: params.team1Name,
      score: params.team1Score,
      accent: COLORS.open,
      x: cardX,
    },
    {
      name: params.team2Name,
      score: params.team2Score,
      accent: COLORS.women,
      x: cardX + cardW + cardGap,
    },
  ];

  for (const team of teams) {
    ctx.fillStyle = COLORS.card;
    fillRoundRect(ctx, team.x, cardY, cardW, cardH, 28);
    ctx.strokeStyle = team.accent;
    ctx.lineWidth = 3;
    strokeRoundRect(ctx, team.x, cardY, cardW, cardH, 28);

    const label = fitText(ctx, team.name, cardW - 48, 28, 16, 700);
    ctx.fillStyle = team.accent;
    ctx.font = `700 ${label.size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(label.text, team.x + cardW / 2, cardY + 64);

    ctx.fillStyle = COLORS.text;
    ctx.font = `700 148px ${FONT}`;
    ctx.fillText(String(team.score), team.x + cardW / 2, cardY + 220);
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = COLORS.open;
  ctx.font = `600 24px ${FONT}`;
  ctx.fillText(APP_URL.replace(/^https:\/\//, ''), 74, h - 48);

  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 22px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('Live lines · Ratios · Watch', w - 74, h - 48);
  ctx.textAlign = 'left';
}

export function renderScoreOgBlob(params: {
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
}): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = SCORE_OG_WIDTH;
  canvas.height = SCORE_OG_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  drawScoreOgImage(ctx, params);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Failed to encode score image'));
      else resolve(blob);
    }, 'image/png');
  });
}

function isShareAbort(err: unknown): boolean {
  return (
    (err instanceof DOMException || err instanceof Error) && err.name === 'AbortError'
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function drawSummaryImage(
  ctx: CanvasRenderingContext2D,
  params: {
    team1Name: string;
    team2Name: string;
    team1Score: number;
    team2Score: number;
    lines: string[];
  }
): void {
  const w = SCORE_OG_WIDTH;
  const h = SCORE_OG_HEIGHT;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);
  for (const blob of BLOBS) {
    fillSoftEllipse(ctx, blob.x * w, blob.y * h, blob.rx, blob.ry, blob.rgb, blob.fade);
  }
  overlayGrain(ctx, w, h);

  ctx.fillStyle = COLORS.muted;
  ctx.font = `600 28px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(APP_NAME, 72, 78);

  const cardY = 110;
  const cardH = params.lines.length > 0 ? 210 : 360;
  const cardGap = 36;
  const cardX = 72;
  const cardW = (w - cardX * 2 - cardGap) / 2;
  const teams = [
    { name: params.team1Name, score: params.team1Score, accent: COLORS.open, x: cardX },
    { name: params.team2Name, score: params.team2Score, accent: COLORS.women, x: cardX + cardW + cardGap },
  ];
  for (const team of teams) {
    ctx.fillStyle = COLORS.card;
    fillRoundRect(ctx, team.x, cardY, cardW, cardH, 28);
    ctx.strokeStyle = team.accent;
    ctx.lineWidth = 3;
    strokeRoundRect(ctx, team.x, cardY, cardW, cardH, 28);
    const label = fitText(ctx, team.name, cardW - 48, 32, 18, 700);
    ctx.fillStyle = team.accent;
    ctx.font = `700 ${label.size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(label.text, team.x + cardW / 2, cardY + 64);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 ${params.lines.length > 0 ? 96 : 148}px ${FONT}`;
    ctx.fillText(String(team.score), team.x + cardW / 2, cardY + cardH - 36);
  }

  ctx.textAlign = 'center';
  let lineY = cardY + cardH + 64;
  params.lines.slice(0, 3).forEach((line, index) => {
    const fitted = fitText(ctx, line, w - 144, 36, 22, 700);
    ctx.fillStyle = index === 0 ? COLORS.muted : COLORS.text;
    ctx.font = `700 ${fitted.size}px ${FONT}`;
    ctx.fillText(fitted.text, w / 2, lineY);
    lineY += fitted.size + 22;
  });

  ctx.fillStyle = COLORS.open;
  ctx.font = `600 24px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(APP_URL.replace(/^https:\/\//, ''), 74, h - 42);
}

async function sharePng(blob: Blob, filename: string, title: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });
  const data: ShareData = { files: [file], title, text: title };
  try {
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share(data);
      return;
    }
    if (typeof navigator.share === 'function') {
      await navigator.share(data);
      return;
    }
  } catch (err) {
    if (isShareAbort(err)) return;
  }
  downloadBlob(blob, filename);
}

export async function shareSummaryImage(params: {
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  lines: string[];
}): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = SCORE_OG_WIDTH;
  canvas.height = SCORE_OG_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  drawSummaryImage(ctx, params);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => {
      if (!next) reject(new Error('Failed to encode score image'));
      else resolve(next);
    }, 'image/png');
  });
  const title = scoreShareTitle(
    params.team1Name,
    params.team2Name,
    params.team1Score,
    params.team2Score
  );
  await sharePng(
    blob,
    scoreOgFilename(params.team1Name, params.team2Name, params.team1Score, params.team2Score),
    params.lines.length > 0 ? `${title}. ${params.lines.join('. ')}` : title
  );
}

export async function shareScoreOgImage(params: {
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
}): Promise<void> {
  const blob = await renderScoreOgBlob(params);
  const title = scoreShareTitle(
    params.team1Name,
    params.team2Name,
    params.team1Score,
    params.team2Score
  );
  await sharePng(
    blob,
    scoreOgFilename(params.team1Name, params.team2Name, params.team1Score, params.team2Score),
    title
  );
}

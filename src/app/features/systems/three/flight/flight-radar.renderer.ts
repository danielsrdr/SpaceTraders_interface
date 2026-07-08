export interface RadarBlip {
  dx: number;
  dz: number;
}

export interface RadarDrawContext {
  canvas: HTMLCanvasElement;
  anchorX: number;
  anchorZ: number;
  range: number;
  detectRange: number;
  sensorQuality: number;
  blips: readonly RadarBlip[];
  flashUntil: number;
  now: number;
}

export function shouldRedrawRadar(
  now: number,
  lastDraw: number,
  flashUntil: number,
  minIntervalMs = 83,
): boolean {
  return now < flashUntil || now - lastDraw >= minIntervalMs;
}

export function drawFlightRadar(ctx: RadarDrawContext): void {
  const { canvas, anchorX, anchorZ, range, detectRange, sensorQuality, blips, flashUntil, now } =
    ctx;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const jitter = (1 - sensorQuality) * 3;

  const g = canvas.getContext('2d');
  if (!g) return;

  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(10, 14, 26, 0.85)';
  g.beginPath();
  g.arc(cx, cy, cx - 2, 0, Math.PI * 2);
  g.fill();

  g.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  g.lineWidth = 1;
  for (let r = 0.25; r <= 1; r += 0.25) {
    g.beginPath();
    g.arc(cx, cy, (cx - 4) * r, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(cx, 4);
  g.lineTo(cx, h - 4);
  g.moveTo(4, cy);
  g.lineTo(w - 4, cy);
  g.stroke();

  for (const blip of blips) {
    const dist = Math.hypot(blip.dx, blip.dz);
    if (dist > detectRange) continue;
    const px = cx + (blip.dx / range) * (cx - 8) + (Math.random() - 0.5) * jitter;
    const py = cy + (blip.dz / range) * (cy - 8) + (Math.random() - 0.5) * jitter;
    g.fillStyle = '#38bdf8';
    g.beginPath();
    g.arc(px, py, 4, 0, Math.PI * 2);
    g.fill();
  }

  g.fillStyle = '#f97316';
  g.beginPath();
  g.arc(cx, cy, 3, 0, Math.PI * 2);
  g.fill();

  if (sensorQuality < 0.985) {
    const noise = 1 - sensorQuality;
    const speckles = Math.floor(noise * 90);
    g.fillStyle = 'rgba(190, 220, 255, 0.5)';
    for (let i = 0; i < speckles; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (cx - 4);
      g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5, 1.5);
    }
    g.save();
    g.globalAlpha = noise * 0.28;
    g.fillStyle = '#f8b65a';
    g.beginPath();
    g.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  if (now < flashUntil) {
    const intensity = (flashUntil - now) / 450;
    g.save();
    g.globalAlpha = 0.45 * intensity;
    g.fillStyle = '#86f7b0';
    g.beginPath();
    g.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.9 * intensity;
    g.lineWidth = 2;
    g.strokeStyle = '#bdffd6';
    g.beginPath();
    g.arc(cx, cy, (cx - 4) * (1 - intensity), 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
}

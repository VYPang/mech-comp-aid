export function mapX(x) {
  return 36 + ((x + 3) / 6) * 208;
}

export function mapY(y) {
  return 132 - y * 42;
}

export function plotPath(fn) {
  const points = [];
  for (let i = 0; i <= 90; i += 1) {
    const x = -3 + (i / 90) * 6;
    points.push(`${i === 0 ? "M" : "L"}${mapX(x)} ${mapY(fn(x))}`);
  }
  return points.join(" ");
}

export function plotLine(fn) {
  return plotPath(fn);
}

export function wave(x, curvature) {
  return Math.sin(1.25 * x) + 0.12 * curvature * x * x - 0.2;
}

export function waveDerivative(x, curvature) {
  return 1.25 * Math.cos(1.25 * x) + 0.24 * curvature * x;
}

export function waveSecondDerivative(x, curvature) {
  return -1.5625 * Math.sin(1.25 * x) + 0.24 * curvature;
}

export function eulerSteps(h, k) {
  const steps = [[0, 1]];
  let t = 0;
  let y = 1;
  while (t < 4 - 1e-6) {
    const dt = Math.min(h, 4 - t);
    y += dt * (-k * y);
    t += dt;
    steps.push([t, y]);
  }
  return steps;
}

export function mapEulerX(x) {
  return 34 + (x / 4) * 210;
}

export function mapEulerY(y) {
  return 220 - y * 160;
}

export function decayPath(k) {
  const points = [];
  for (let i = 0; i <= 80; i += 1) {
    const x = (i / 80) * 4;
    const y = Math.exp(-k * x);
    points.push(`${i === 0 ? "M" : "L"}${mapEulerX(x)} ${mapEulerY(y)}`);
  }
  return points.join(" ");
}

export function gridXs(h) {
  const xs = [];
  for (let x = -2.5; x <= 2.51; x += h) {
    xs.push(Number(x.toFixed(3)));
  }
  return xs;
}

export function residualAt(x, values) {
  const exactSecond = -Math.sin(x);
  const candidateSecond = -values.amp * Math.sin(x) - 1.62 * values.wiggle * Math.sin(3 * x);
  return candidateSecond - exactSecond;
}

export function meshLines(x, y, size, n) {
  const lines = [];
  for (let i = 1; i < n; i += 1) {
    const p = x + (size * i) / n;
    const q = y + (size * i) / n;
    lines.push(`<path d="M${p} ${y} V${y + size}" class="numerical-figure-mesh-line" />`);
    lines.push(`<path d="M${x} ${q} H${x + size}" class="numerical-figure-mesh-line" />`);
  }
  return lines.join("");
}

export function hat(x, center) {
  return Math.max(0, 1 - Math.abs(x - center) / 1.5);
}
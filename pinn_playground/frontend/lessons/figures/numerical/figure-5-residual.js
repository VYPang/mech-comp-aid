import { mountNumericalFigure } from "./figure-shared.js?v=checkpoint-shell-15";
import {
  gridXs,
  mapX,
  mapY,
  plotPath,
  residualAt,
} from "./figure-utils.js?v=checkpoint-shell-15";

export const residualFigureConfig = {
  headline: "Figure 5 - Finite Difference Residual",
  title: "Finite Difference Residual",
  controls: [
    { id: "h", label: "Grid spacing", min: 0.25, max: 1.0, step: 0.05, value: 0.5 },
    { id: "amp", label: "Candidate amplitude", min: 0.4, max: 1.6, step: 0.1, value: 1.0 },
    { id: "wiggle", label: "Extra wiggle", min: 0, max: 1.2, step: 0.1, value: 0.3 },
  ],
  render(values) {
    const xs = gridXs(values.h);
    const residuals = xs.map((x) => residualAt(x, values));
    const maxR = Math.max(...residuals.map((r) => Math.abs(r)), 0.01);
    return {
      svg: `
        <path d="${plotPath((x) => values.amp * Math.sin(x) + 0.18 * values.wiggle * Math.sin(3 * x))}" class="numerical-figure-curve" />
        ${xs.map((x, i) => `
          <circle cx="${mapX(x)}" cy="${mapY(values.amp * Math.sin(x) + 0.18 * values.wiggle * Math.sin(3 * x))}" r="4" class="numerical-figure-point" />
          <rect x="${mapX(x) - 4}" y="${222 - Math.abs(residuals[i]) / maxR * 46}" width="8" height="${Math.abs(residuals[i]) / maxR * 46}" class="numerical-figure-residual" />
        `).join("")}
      `,
      stats: [
        ["grid points", String(xs.length)],
        ["max residual", maxR.toFixed(3)],
        ["residual", "equation mismatch"],
      ],
      hint: "A smooth-looking candidate can still leave residual. Residual measures mismatch with the governing equation, not visual smoothness.",
    };
  },
};

export function createResidualFigure(host) {
  return mountNumericalFigure(host, residualFigureConfig);
}
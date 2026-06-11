import { mountNumericalFigure } from "./figure-shared.js?v=checkpoint-shell-15";
import { meshLines } from "./figure-utils.js?v=checkpoint-shell-15";

export const meshFigureConfig = {
  headline: "Figure 7 - Mesh Density And Convergence",
  title: "Mesh Density And Convergence",
  controls: [
    { id: "cells", label: "Cells per side", min: 12, max: 80, step: 2, value: 32 },
    { id: "patch", label: "Patch width", min: 0.08, max: 0.45, step: 0.01, value: 0.18 },
  ],
  render(values) {
    const n = Math.round(values.cells / 8);
    const loadFacets = Math.max(1, Math.round(values.cells * values.patch));
    const convergence = 1 + 0.7 / Math.sqrt(values.cells);
    return {
      svg: `
        <rect x="52" y="36" width="152" height="152" class="numerical-figure-frame" />
        <rect x="94" y="78" width="68" height="68" class="numerical-figure-hole" />
        ${meshLines(52, 36, 152, n)}
        <path d="M52 214 C86 188 126 178 204 174" class="numerical-figure-curve" />
        <circle cx="${58 + values.cells * 2.25}" cy="${174 + (convergence - 1) * 74}" r="5" class="numerical-figure-point-alt" />
        <text x="52" y="234" class="numerical-figure-label">toy convergence curve</text>
      `,
      stats: [
        ["cells per side", String(Math.round(values.cells))],
        ["load facets", String(loadFacets)],
        ["relative quantity", convergence.toFixed(3)],
      ],
      hint: "A finer mesh gives more local detail. Some quantities settle smoothly; peak stresses and load facets can change discretely.",
    };
  },
};

export function createMeshFigure(host) {
  return mountNumericalFigure(host, meshFigureConfig);
}
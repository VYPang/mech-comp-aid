import { mountNumericalFigure } from "./figure-shared.js?v=checkpoint-shell-15";
import { hat, plotLine } from "./figure-utils.js?v=checkpoint-shell-15";

export const weakFormFigureConfig = {
  headline: "Figure 8 - Weak Form To FEM Workspace",
  title: "Weak Form To FEM Workspace",
  controls: [
    { id: "a1", label: "Shape coefficient 1", min: -1, max: 1, step: 0.1, value: 0.2 },
    { id: "a2", label: "Shape coefficient 2", min: -1, max: 1, step: 0.1, value: 0.8 },
    { id: "a3", label: "Shape coefficient 3", min: -1, max: 1, step: 0.1, value: 0.1 },
  ],
  render(values) {
    const mismatch = Math.abs(values.a1 - 0.1) + Math.abs(values.a2 - 0.55) + Math.abs(values.a3 + 0.05);
    return {
      svg: `
        <path d="${plotLine((x) => values.a1 * hat(x, -1.5) + values.a2 * hat(x, 0) + values.a3 * hat(x, 1.5))}" class="numerical-figure-curve" />
        <path d="${plotLine((x) => hat(x, -1.5))}" class="numerical-figure-shape-function" />
        <path d="${plotLine((x) => hat(x, 0))}" class="numerical-figure-shape-function" />
        <path d="${plotLine((x) => hat(x, 1.5))}" class="numerical-figure-shape-function" />
        <rect x="44" y="${168 - mismatch * 10}" width="174" height="${Math.min(80, mismatch * 18)}" class="numerical-figure-residual-area" />
        <text x="48" y="226" class="numerical-figure-label">K d = f from integrated balance</text>
      `,
      stats: [
        ["unknowns", "d"],
        ["system", "K d = f"],
        ["weighted mismatch", mismatch.toFixed(2)],
      ],
      hint: "FEM chooses displacement coefficients so the residual is balanced in an integrated sense, then post-processes displacement into stress.",
    };
  },
};

export function createWeakFormFigure(host) {
  return mountNumericalFigure(host, weakFormFigureConfig);
}
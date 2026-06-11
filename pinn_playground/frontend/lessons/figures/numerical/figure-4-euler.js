import { mountNumericalFigure } from "./figure-shared.js?v=checkpoint-shell-15";
import {
  decayPath,
  eulerSteps,
  mapEulerX,
  mapEulerY,
} from "./figure-utils.js?v=checkpoint-shell-15";

export const eulerFigureConfig = {
  headline: "Figure 4 - Euler Stepping",
  title: "Euler Stepping",
  controls: [
    { id: "h", label: "Step size", min: 0.1, max: 0.8, step: 0.05, value: 0.3 },
    { id: "k", label: "Decay rate", min: 0.4, max: 1.8, step: 0.1, value: 1.0 },
  ],
  render(values) {
    const steps = eulerSteps(values.h, values.k);
    const final = steps[steps.length - 1];
    const exactFinal = Math.exp(-values.k * 4);
    return {
      svg: `
        <path d="${decayPath(values.k)}" class="numerical-figure-curve" />
        <polyline points="${steps.map(([x, y]) => `${mapEulerX(x)},${mapEulerY(y)}`).join(" ")}" class="numerical-figure-polyline" />
        ${steps.map(([x, y]) => `<circle cx="${mapEulerX(x)}" cy="${mapEulerY(y)}" r="3" class="numerical-figure-point" />`).join("")}
      `,
      stats: [
        ["steps", String(steps.length - 1)],
        ["final error", Math.abs(final[1] - exactFinal).toFixed(3)],
        ["slope rule", "dy/dt = -ky"],
      ],
      hint: "Euler method turns a continuous slope rule into repeated computable steps. Larger steps are cheaper but less accurate.",
    };
  },
};

export function createEulerFigure(host) {
  return mountNumericalFigure(host, eulerFigureConfig);
}
import { mountNumericalFigure } from "./figure-shared.js?v=checkpoint-shell-15";
import {
  mapX,
  mapY,
  plotLine,
  plotPath,
  wave,
  waveDerivative,
  waveSecondDerivative,
} from "./figure-utils.js?v=checkpoint-shell-15";

export const taylorFigureConfig = {
  headline: "Figure 3 - Local Approximation Error",
  title: "Local Approximation Error",
  controls: [
    { id: "x0", label: "Expansion point", min: -2, max: 2, step: 0.1, value: -0.4 },
    { id: "h", label: "Query step", min: 0.2, max: 2.2, step: 0.1, value: 1.0 },
    { id: "curvature", label: "Curvature strength", min: 0.4, max: 1.8, step: 0.1, value: 1.0 },
  ],
  render(values) {
    const x0 = values.x0;
    const xq = x0 + values.h;
    const f0 = wave(x0, values.curvature);
    const slope = waveDerivative(x0, values.curvature);
    const second = waveSecondDerivative(x0, values.curvature);
    const trueQ = wave(xq, values.curvature);
    const linearQ = f0 + slope * values.h;
    const quadQ = linearQ + 0.5 * second * values.h * values.h;
    return {
      svg: `
        <path d="${plotPath((x) => wave(x, values.curvature))}" class="numerical-figure-curve" />
        <path d="${plotLine((x) => f0 + slope * (x - x0))}" class="numerical-figure-tangent" />
        <path d="${plotLine((x) => f0 + slope * (x - x0) + 0.5 * second * (x - x0) ** 2)}" class="numerical-figure-quadratic" />
        <circle cx="${mapX(x0)}" cy="${mapY(f0)}" r="5" class="numerical-figure-point" />
        <circle cx="${mapX(xq)}" cy="${mapY(trueQ)}" r="5" class="numerical-figure-point-alt" />
        <path d="M${mapX(xq)} ${mapY(linearQ)} V${mapY(trueQ)}" class="numerical-figure-error" />
      `,
      stats: [
        ["linear error", Math.abs(linearQ - trueQ).toFixed(3)],
        ["quadratic error", Math.abs(quadQ - trueQ).toFixed(3)],
        ["step h", values.h.toFixed(1)],
      ],
      hint: "Taylor approximation is local. A smaller step usually reduces the error because the tangent is being used over a shorter distance.",
    };
  },
};

export function createTaylorFigure(host) {
  return mountNumericalFigure(host, taylorFigureConfig);
}
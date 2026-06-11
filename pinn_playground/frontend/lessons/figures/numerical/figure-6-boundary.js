import { mountNumericalFigure } from "./figure-shared.js?v=checkpoint-shell-15";

export const boundaryFigureConfig = {
  headline: "Figure 6 - Boundary Conditions",
  title: "Boundary Conditions",
  controls: [
    { id: "traction", label: "Traction magnitude", min: 0, max: 2, step: 0.1, value: 1.0 },
    { id: "fixed", label: "Fixed-boundary strength", min: 0, max: 1, step: 0.05, value: 1.0 },
    { id: "patch", label: "Loaded patch width", min: 0.2, max: 0.8, step: 0.05, value: 0.45 },
  ],
  render(values) {
    const deflect = 34 * values.traction * (1 - 0.45 * values.fixed);
    const patchW = 118 * values.patch;
    return {
      svg: `
        <path d="M58 72 H210 V198 H58 Z" class="numerical-figure-frame" />
        <path d="M58 198 H210" class="numerical-figure-fixed" />
        <path d="M${134 - patchW / 2} 72 H${134 + patchW / 2}" class="numerical-figure-loaded-edge" />
        <path d="M72 86 C102 ${100 + deflect} 168 ${116 + deflect} 198 ${88 + deflect}" class="numerical-figure-deformed" />
        <path d="M134 42 V72" class="numerical-figure-load" />
        <text x="42" y="226" class="numerical-figure-label">bottom fixed, top traction patch, sides free</text>
      `,
      stats: [
        ["Dirichlet", "u = 0"],
        ["Neumann", "t = sigma n"],
        ["patch width", values.patch.toFixed(2)],
      ],
      hint: "Boundary conditions close the problem. Moving the load patch changes the physical case being solved.",
    };
  },
};

export function createBoundaryFigure(host) {
  return mountNumericalFigure(host, boundaryFigureConfig);
}
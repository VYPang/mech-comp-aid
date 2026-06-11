import { mountNumericalFigure } from "./figure-shared.js?v=checkpoint-shell-15";

export const analyticalFigureConfig = {
  headline: "Figure 2 - One Formula Versus A Field",
  title: "One Formula Versus A Field",
  controls: [
    { id: "load", label: "Load magnitude", min: 0.4, max: 2.0, step: 0.1, value: 1.0 },
    { id: "patch", label: "Load patch position", min: 0.2, max: 0.8, step: 0.02, value: 0.55 },
    { id: "brace", label: "Brace influence", min: 0, max: 1, step: 0.05, value: 0.35 },
  ],
  render(values) {
    const barTip = 78 + values.load * 25;
    const patchX = 54 + values.patch * 150;
    const braceDrop = 34 * (1 - values.brace);
    return {
      svg: `
        <rect x="34" y="42" width="132" height="28" class="numerical-figure-member" />
        <path d="M34 35 V78" class="numerical-figure-fixed" />
        <path d="M166 56 H${barTip + 150}" class="numerical-figure-load" />
        <text x="42" y="110" class="numerical-figure-label">bar: delta = PL/AE</text>
        <rect x="54" y="138" width="150" height="110" class="numerical-figure-frame" />
        <rect x="92" y="166" width="74" height="50" class="numerical-figure-hole" />
        <path d="M72 236 L186 ${154 + braceDrop}" class="numerical-figure-brace" />
        <path d="M${patchX} 126 v28" class="numerical-figure-load" />
        <text x="54" y="276" class="numerical-figure-label">frame: displacement and stress fields</text>
      `,
      stats: [
        ["bar estimate", `${(values.load * 1.2).toFixed(2)} units`],
        ["load x", values.patch.toFixed(2)],
        ["field needed", "yes"],
      ],
      hint: "A bar formula gives one scalar estimate. The frame needs a field because geometry and load position change local response.",
    };
  },
};

export function createAnalyticalFigure(host) {
  return mountNumericalFigure(host, analyticalFigureConfig);
}
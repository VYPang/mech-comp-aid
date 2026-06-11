import { mountNumericalFigure } from "./figure-shared.js?v=checkpoint-shell-15";

export const mechanicsFigureConfig = {
  headline: "Figure 1 - Axial Point Load On A Fixed Cuboid (2D View)",
  title: "Axial Point Load On A Fixed Cuboid (2D View)",
  viewBox: "0 0 260 184",
  computeButtonLabel: "Compute displacement",
  controlsPlacement: "top",
  controls: [
    { id: "load", label: "Axial load P", min: 20, max: 180, step: 5, value: 80 },
    { id: "area", label: "Cross-section area A", min: 0.6, max: 2.4, step: 0.1, value: 1.2 },
    { id: "young", label: "Young's modulus E", min: 80, max: 260, step: 10, value: 160 },
  ],
  render(values, options = {}) {
    const computed = Boolean(options.computed);
    const length = 1.4;
    const sigma = values.load / values.area;
    const epsilon = sigma / values.young;
    const delta = epsilon * length;
    const bodyTop = 50;
    const bodyHeight = 94;
    const compression = computed ? Math.min(16, delta * 28) : 0;
    const topY = bodyTop + compression;
    const bottomY = bodyTop + bodyHeight;
    const leftX = 94;
    const rightX = 166;
    const centerX = (leftX + rightX) / 2;
    return {
      svg: `
        <path d="M${leftX} ${bodyTop} H${rightX}" class="numerical-figure-reference" />
        <rect x="${leftX}" y="${topY}" width="${rightX - leftX}" height="${bottomY - topY}" class="numerical-figure-shape" />
        <path d="M86 ${bottomY} H174" class="numerical-figure-ground" />
        ${Array.from({ length: 8 }, (_, index) => {
          const x = 92 + index * 11;
          return `<path d="M${x} ${bottomY} l-8 12" class="numerical-figure-ground" />`;
        }).join("")}
        <path d="M${centerX} 28 V${topY - 16}" class="numerical-figure-load" />
        <path d="M${centerX - 7} ${topY - 24} L${centerX} ${topY - 12} L${centerX + 7} ${topY - 24}" class="numerical-figure-load" />
        <text x="${centerX}" y="18" text-anchor="middle" class="numerical-figure-label">point load P</text>
        <text x="${centerX}" y="173" text-anchor="middle" class="numerical-figure-label">fixed to ground</text>
      `,
      stats: computed ? [
        ["Stress σ", sigma.toFixed(2)],
        ["Strain ε", epsilon.toFixed(4)],
        ["Elongation δ", delta.toFixed(4)],
        ["Length L", length.toFixed(2)],
      ] : [],
      prompt: computed ? "" : "Adjust the sliders, then press Compute displacement to reveal the response.",
      hint: "This sketch is a 2D side view of a 3D cuboid. Area A means the cross-section normal to the load, so increasing A or stiffness reduces strain and displacement for the same point load.",
    };
  },
};

export function createMechanicsFigure(host) {
  return mountNumericalFigure(host, mechanicsFigureConfig);
}
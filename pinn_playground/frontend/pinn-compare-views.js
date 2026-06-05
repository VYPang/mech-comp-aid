export const PINN_COMPARE_VIEWS = Object.freeze([
  Object.freeze({
    id: "stress",
    label: "Stress",
    baselineTitle: "FEM Stress",
    comparisonTitle: "Absolute Stress Error",
  }),
  Object.freeze({
    id: "deformation",
    label: "Deformation",
    baselineTitle: "FEM Deformation",
    comparisonTitle: "Absolute Displacement Error",
  }),
]);

export function resolvePinnCompareView(viewId) {
  return PINN_COMPARE_VIEWS.find((view) => view.id === viewId) ?? PINN_COMPARE_VIEWS[0];
}

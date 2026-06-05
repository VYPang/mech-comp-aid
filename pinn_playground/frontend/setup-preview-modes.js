export const FEM_SETUP_PREVIEW_MODES = Object.freeze([
  Object.freeze({
    id: "mesh",
    label: "Mesh",
    title: "Live Mesh Preview",
    idleSummary: "Waiting for mesh data",
  }),
  Object.freeze({
    id: "boundary",
    label: "Boundary",
    title: "Live Boundary Preview",
    idleSummary: "Waiting for boundary data",
  }),
]);

export const PINN_SETUP_PREVIEW_MODES = Object.freeze([
  Object.freeze({
    id: "collocation",
    label: "Collocation",
    title: "Live Collocation Preview",
    idleSummary: "Waiting for point data",
  }),
]);

export function resolveSetupPreviewMode(modes, requestedModeId) {
  const fallback = modes[0] ?? null;
  if (!requestedModeId) {
    return fallback;
  }
  return modes.find((mode) => mode.id === requestedModeId) ?? fallback;
}

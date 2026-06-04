export function buildNumericalTaskChecks(taskState) {
  return [
    { id: "define-geometry", complete: Boolean(taskState.geometryTouched) },
    { id: "define-loading-patch", complete: Boolean(taskState.loadingPatchTouched) },
    {
      id: "set-mesh-density",
      complete: Boolean(taskState.meshTargetReached && taskState.solvedAtTargetCells),
    },
    { id: "change-young-run-result", complete: Boolean(taskState.solvedAtTargetYoung) },
  ];
}

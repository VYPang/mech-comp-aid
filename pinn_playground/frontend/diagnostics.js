import { fetchWebuiDiagnostics } from "./api.js?v=checkpoint-shell-13";
import { buildDiagnosticsRequest } from "./control-config.js?v=checkpoint-shell-13";

export function installDiagnosticsDebugHook({ runtimeState, progressStore }) {
  if (typeof window === "undefined") {
    return null;
  }

  const debug = {
    getSnapshot() {
      return buildSnapshot(runtimeState, progressStore);
    },
    buildRequest(options = {}) {
      return buildDiagnosticsRequest(runtimeState, normalizeOptions(options));
    },
    async runDiagnostics(options = {}) {
      const request = buildDiagnosticsRequest(runtimeState, normalizeOptions(options));
      const result = await fetchWebuiDiagnostics(request);
      if (window.console?.table) {
        window.console.table(result.findings?.map((finding) => ({
          severity: finding.severity,
          code: finding.code,
          target: finding.target ?? "",
        })) ?? []);
      }
      return result;
    },
  };

  window.pinnPlaygroundDebug = debug;
  return debug;
}

function buildSnapshot(runtimeState, progressStore) {
  const request = buildDiagnosticsRequest(runtimeState);
  return {
    activeCheckpoint: progressStore.getActiveCheckpoint()?.id ?? null,
    progress: progressStore.getState(),
    diagnosticsRequest: request,
    checkpointEvents: cloneJson(runtimeState.checkpointEvents ?? {}),
  };
}

function normalizeOptions(options) {
  return {
    ...options,
    run: {
      ...(options.run ?? {}),
      ...(options.femSolve === undefined ? {} : { fem_solve: Boolean(options.femSolve) }),
      ...(options.femPreview === undefined ? {} : { fem_preview: Boolean(options.femPreview) }),
      ...(options.pinnPreview === undefined ? {} : { pinn_preview: Boolean(options.pinnPreview) }),
      ...(options.teacherPreview === undefined ? {} : { teacher_preview: Boolean(options.teacherPreview) }),
      ...(options.stressGridN === undefined ? {} : { stress_grid_n: Number(options.stressGridN) }),
    },
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
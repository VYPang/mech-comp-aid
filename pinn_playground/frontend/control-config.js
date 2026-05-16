export const DEFAULT_FEM_CONTROLS = Object.freeze({
  geometry: "base",
  nCells: "40",
  frameThickness: "0.18",
  braceHalfWidth: "0.018",
  patchCenter: "0.50",
  patchWidth: "0.20",
  young: "210000000000",
  poisson: "0.3",
});

export const DEFAULT_PINN_CONTROLS = Object.freeze({
  geometry: "base",
  frameThickness: "0.18",
  braceHalfWidth: "0.018",
  patchCenter: "0.50",
  patchWidth: "0.20",
  young: "210000000000",
  poisson: "0.3",
  samplingStrategy: "uniform",
  nDomain: "900",
  nBoundary: "160",
  epochs: "500",
  normalizeInputs: true,
  hiddenDim: "96",
  nHiddenLayers: "5",
  pdeWeight: "1.0",
  bcWeight: "5.0",
  residualResampleEvery: "200",
  fourierFeatures: false,
  fourierSigma: "1.0",
  teacherInterior: "120",
  teacherBoundary: "40",
  teacherLoadPatch: "20",
  teacherWeight: "10.0",
});

export const DEFAULT_DIAGNOSTIC_RUN_OPTIONS = Object.freeze({
  fem_preview: true,
  fem_solve: false,
  pinn_preview: true,
  teacher_preview: true,
  stress_grid_n: 40,
});

const SHARED_STRUCTURAL_KEYS = [
  "geometry",
  "frameThickness",
  "braceHalfWidth",
  "patchCenter",
  "patchWidth",
];

export function mergeControlValues(defaultValues, savedValues = null) {
  return { ...defaultValues, ...(savedValues ?? {}) };
}

export function mergeSharedStructuralValues(baseValues, sharedValues = null) {
  if (!sharedValues) {
    return { ...baseValues };
  }

  const merged = { ...baseValues };
  SHARED_STRUCTURAL_KEYS.forEach((key) => {
    if (sharedValues[key] !== undefined) {
      merged[key] = sharedValues[key];
    }
  });
  return merged;
}

export function pickSharedStructuralValues(values) {
  return Object.fromEntries(
    SHARED_STRUCTURAL_KEYS.map((key) => [key, values[key]]),
  );
}

export function readFemControlValues(controls, fallback = DEFAULT_FEM_CONTROLS) {
  return {
    geometry: readValue(controls?.geometry, fallback.geometry),
    nCells: readValue(controls?.nCells, fallback.nCells),
    frameThickness: readValue(controls?.frameThickness, fallback.frameThickness),
    braceHalfWidth: readValue(controls?.braceHalfWidth, fallback.braceHalfWidth),
    patchCenter: readValue(controls?.patchCenter, fallback.patchCenter),
    patchWidth: readValue(controls?.patchWidth, fallback.patchWidth),
    young: readValue(controls?.young, fallback.young),
    poisson: readValue(controls?.poisson, fallback.poisson),
  };
}

export function readPinnControlValues(controls, fallback = DEFAULT_PINN_CONTROLS) {
  return {
    geometry: readValue(controls?.geometry, fallback.geometry),
    frameThickness: readValue(controls?.frameThickness, fallback.frameThickness),
    braceHalfWidth: readValue(controls?.braceHalfWidth, fallback.braceHalfWidth),
    patchCenter: readValue(controls?.patchCenter, fallback.patchCenter),
    patchWidth: readValue(controls?.patchWidth, fallback.patchWidth),
    young: readValue(controls?.young, fallback.young),
    poisson: readValue(controls?.poisson, fallback.poisson),
    samplingStrategy: readValue(controls?.samplingStrategy, fallback.samplingStrategy),
    nDomain: readValue(controls?.nDomain, fallback.nDomain),
    nBoundary: readValue(controls?.nBoundary, fallback.nBoundary),
    epochs: readValue(controls?.epochs, fallback.epochs),
    normalizeInputs: readChecked(controls?.normalizeInputs, fallback.normalizeInputs),
    hiddenDim: readValue(controls?.hiddenDim, fallback.hiddenDim),
    nHiddenLayers: readValue(controls?.nHiddenLayers, fallback.nHiddenLayers),
    pdeWeight: readValue(controls?.pdeWeight, fallback.pdeWeight),
    bcWeight: readValue(controls?.bcWeight, fallback.bcWeight),
    residualResampleEvery: readValue(controls?.residualResampleEvery, fallback.residualResampleEvery),
    fourierFeatures: readChecked(controls?.fourierFeatures, fallback.fourierFeatures),
    fourierSigma: readValue(controls?.fourierSigma, fallback.fourierSigma),
    teacherInterior: readValue(controls?.teacherInterior, fallback.teacherInterior),
    teacherBoundary: readValue(controls?.teacherBoundary, fallback.teacherBoundary),
    teacherLoadPatch: readValue(controls?.teacherLoadPatch, fallback.teacherLoadPatch),
    teacherWeight: readValue(controls?.teacherWeight, fallback.teacherWeight),
  };
}

export function buildStructuralProblem(values) {
  return {
    geometry: {
      geometry: values.geometry,
      frame_thickness: Number(values.frameThickness),
      brace_half_width: Number(values.braceHalfWidth),
    },
    material: {
      young: Number(values.young),
      poisson: Number(values.poisson),
    },
    support: {
      fixed_edge: "bottom",
    },
    load: {
      edge: "top",
      patch_center: Number(values.patchCenter),
      patch_width: Number(values.patchWidth),
      traction_x: 0.0,
      traction_y: -1.0,
    },
  };
}

export function buildFemConfig(values) {
  return {
    ...buildStructuralProblem(values),
    mesh: {
      n_cells: Number(values.nCells),
    },
  };
}

export function buildPinnConfig(values, options = {}) {
  return {
    problem: buildStructuralProblem(values),
    sampling_strategy: values.samplingStrategy,
    n_domain: Number(values.nDomain),
    n_boundary: Number(values.nBoundary),
    epochs: Number(values.epochs),
    normalize_inputs: Boolean(values.normalizeInputs),
    pde_weight: Number(values.pdeWeight),
    bc_weight: Number(values.bcWeight),
    hidden_dim: Number(values.hiddenDim),
    n_hidden_layers: Number(values.nHiddenLayers),
    residual_resample_every: Number(values.residualResampleEvery),
    fourier_features: Boolean(values.fourierFeatures),
    fourier_sigma: Number(values.fourierSigma),
    teacher: {
      enabled: Boolean(options.teacherEnabled),
      n_interior: Number(values.teacherInterior),
      n_boundary: Number(values.teacherBoundary),
      n_load_patch: Number(values.teacherLoadPatch),
      weight: Number(values.teacherWeight),
    },
    learning_rate: 0.001,
    update_every: 50,
    stress_grid_n: 60,
    seed: 0,
  };
}

export function buildDiagnosticsRequest(runtimeState, options = {}) {
  const fem = runtimeState.fem?.currentConfig
    ?? buildFemConfig(mergeControlValues(DEFAULT_FEM_CONTROLS, runtimeState.fem?.savedControls));
  const pinn = runtimeState.pinn?.currentConfig
    ?? buildPinnConfig(mergeControlValues(DEFAULT_PINN_CONTROLS, runtimeState.pinn?.savedControls), {
      teacherEnabled: Boolean(options.teacherEnabled),
    });

  return {
    fem,
    pinn,
    run: {
      ...DEFAULT_DIAGNOSTIC_RUN_OPTIONS,
      ...(options.run ?? {}),
    },
    student_question: options.studentQuestion ?? null,
  };
}

function readValue(control, fallback) {
  return control?.value ?? fallback;
}

function readChecked(control, fallback) {
  if (!control) {
    return Boolean(fallback);
  }
  return Boolean(control.checked);
}
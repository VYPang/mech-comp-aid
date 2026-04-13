const STORAGE_KEY = "pinn-playground-checkpoint-shell-v1";

export const checkpointGroups = [
  {
    id: "numerical",
    title: "Numerical Cell",
    description: "Build intuition for geometry, supports, loads, and solver expectations before moving into PINN.",
    checkpoints: [
      {
        id: "numerical-preview",
        cellId: "numerical",
        title: "Preview Mesh and Loading",
        subtitle: "Inspect the structured FEM mesh, the fixed bottom support, and the top-edge traction patch.",
        controlsTitle: "Numerical Setup",
        controlsSubtitle: "The numerical cell already supports live preview. Adjust the structured mesh and load patch before continuing.",
        requirements: [
          "Review the frame geometry and reinforcement option.",
          "Check where the bottom support and top load patch appear.",
          "Use the button when you are ready to continue.",
        ],
        completeMode: "manual",
      },
      {
        id: "numerical-solve",
        cellId: "numerical",
        title: "Run FEM Solve",
        subtitle: "Solve the current frame case with scikit-fem and inspect deformation plus von Mises stress.",
        controlsTitle: "Numerical Solve",
        controlsSubtitle: "Use the same geometry and top-edge load definition, then run a static FEM solve from this checkpoint.",
        requirements: [
          "Review the current mesh and load patch before solving.",
          "Click the FEM solve button and wait for the result payload.",
          "This checkpoint unlocks automatically once the solve succeeds.",
        ],
        completeMode: "api_success",
      },
      {
        id: "numerical-inspect",
        cellId: "numerical",
        title: "Inspect Numerical Result",
        subtitle: "Review the deformation scale, stress response, and solver summary before continuing into the PINN cell.",
        controlsTitle: "Numerical Reflection",
        controlsSubtitle: "This stage preserves the latest FEM result while you reflect on what the baseline tells you.",
        requirements: [
          "Inspect the latest deformation and stress result.",
          "Notice that the numerical method is the trust baseline for later PINN comparison.",
          "Continue manually once the numerical baseline feels clear.",
        ],
        completeMode: "manual",
      },
    ],
  },
  {
    id: "pinn",
    title: "PINN Cell",
    description: "Reuse the same geometry family to preview collocation, train the network, and later compare against the FEM baseline.",
    checkpoints: [
      {
        id: "pinn-preview",
        cellId: "pinn",
        title: "Preview Collocation Points",
        subtitle: "Explore geometry, sampling, and point density before starting a training run.",
        controlsTitle: "PINN Preview Controls",
        controlsSubtitle: "Configure the PINN geometry and collocation setup. Training controls appear in the next checkpoint.",
        requirements: [
          "Adjust geometry and sampling choices.",
          "Inspect the collocation preview before entering training.",
          "Continue manually when ready.",
        ],
        completeMode: "manual",
      },
      {
        id: "pinn-train",
        cellId: "pinn",
        title: "Train PINN",
        subtitle: "Run the existing WebSocket-based training workflow and inspect the live loss and stress plots.",
        controlsTitle: "PINN Training Controls",
        controlsSubtitle: "This checkpoint preserves the current live training behavior inside the new shell.",
        requirements: [
          "Start or stop training as needed.",
          "Watch the stress map and loss curves update in place.",
          "Continue manually after a run.",
        ],
        completeMode: "manual",
      },
      {
        id: "pinn-compare",
        cellId: "pinn",
        title: "Compare Against FEM",
        subtitle: "This final checkpoint is reserved for future FEM-vs-PINN comparison once the numerical solver is in place.",
        controlsTitle: "Comparison Checkpoint",
        controlsSubtitle: "The shell is ready for comparison data once the FEM solve exists.",
        requirements: [
          "Use this checkpoint as the future comparison landing zone.",
          "Comparison requirements will become automatic later.",
        ],
        completeMode: "manual",
      },
    ],
  },
];

const checkpointsById = new Map(
  checkpointGroups.flatMap((group) => group.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint])),
);

const orderedCheckpointIds = checkpointGroups.flatMap((group) => group.checkpoints.map((checkpoint) => checkpoint.id));

function createInitialState() {
  const checkpoints = Object.fromEntries(
    orderedCheckpointIds.map((id, index) => [
      id,
      {
        unlocked: index === 0,
        completed: false,
        completeMode: checkpointsById.get(id)?.completeMode ?? "manual",
        completedAt: null,
      },
    ]),
  );

  return {
    activeCheckpointId: orderedCheckpointIds[0],
    checkpoints,
  };
}

function readStoredState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function saveStoredState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_error) {
    // Storage is best-effort only.
  }
}

function mergeStoredState(stored) {
  const state = createInitialState();
  if (!stored || typeof stored !== "object") {
    return state;
  }

  if (typeof stored.activeCheckpointId === "string" && checkpointsById.has(stored.activeCheckpointId)) {
    state.activeCheckpointId = stored.activeCheckpointId;
  }

  if (stored.checkpoints && typeof stored.checkpoints === "object") {
    orderedCheckpointIds.forEach((id) => {
      const incoming = stored.checkpoints[id];
      if (!incoming || typeof incoming !== "object") {
        return;
      }
      state.checkpoints[id] = {
        ...state.checkpoints[id],
        unlocked: Boolean(incoming.unlocked),
        completed: Boolean(incoming.completed),
        completedAt: incoming.completedAt ?? null,
      };
    });
  }

  if (!state.checkpoints[state.activeCheckpointId]?.unlocked) {
    state.activeCheckpointId = orderedCheckpointIds.find((id) => state.checkpoints[id].unlocked) ?? orderedCheckpointIds[0];
  }

  return state;
}

export function createProgressStore() {
  let state = mergeStoredState(readStoredState());
  const listeners = new Set();

  function emit() {
    saveStoredState(state);
    listeners.forEach((listener) => listener(getState()));
  }

  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  function getCheckpoint(id) {
    return checkpointsById.get(id);
  }

  function getActiveCheckpoint() {
    return getCheckpoint(state.activeCheckpointId);
  }

  function activateCheckpoint(id) {
    if (!checkpointsById.has(id) || !state.checkpoints[id]?.unlocked) {
      return;
    }
    state.activeCheckpointId = id;
    emit();
  }

  function markCheckpointComplete(id) {
    if (!checkpointsById.has(id)) {
      return;
    }

    state.checkpoints[id].completed = true;
    state.checkpoints[id].completedAt = new Date().toISOString();
    const currentIndex = orderedCheckpointIds.indexOf(id);
    const nextId = currentIndex >= 0 ? orderedCheckpointIds[currentIndex + 1] : null;
    if (nextId) {
      state.checkpoints[nextId].unlocked = true;
      state.activeCheckpointId = nextId;
    }
    emit();
  }

  function reset() {
    state = createInitialState();
    emit();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    checkpointGroups,
    orderedCheckpointIds,
    checkpointsById,
    getState,
    getCheckpoint,
    getActiveCheckpoint,
    activateCheckpoint,
    markCheckpointComplete,
    reset,
    subscribe,
  };
}

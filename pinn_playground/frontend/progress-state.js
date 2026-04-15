const STORAGE_KEY = "pinn-playground-checkpoint-shell-v1";

export const checkpointGroups = [
  {
    id: "numerical",
    title: "Numerical Cell",
    description: "Read the load path, solve once, and carry that baseline into the PINN.",
    checkpoints: [
      {
        id: "numerical-preview",
        cellId: "numerical",
        title: "Preview Mesh and Loading",
        subtitle: "Check the mesh, bottom support, and top load patch.",
        controlsTitle: "Numerical Setup",
        controlsSubtitle: "Change geometry, mesh density, and load patch. The preview updates automatically.",
        requirements: [
          "Pick a frame or brace layout.",
          "Confirm the support and load patch are where you expect.",
          "Continue when the setup looks right.",
        ],
        completeMode: "manual",
      },
      {
        id: "numerical-solve",
        cellId: "numerical",
        title: "Run FEM Solve",
        subtitle: "Solve the current case and inspect deformation plus von Mises stress.",
        controlsTitle: "Numerical Solve",
        controlsSubtitle: "Keep the same setup, then run one static FEM solve from this checkpoint.",
        requirements: [
          "Check the current mesh and load patch.",
          "Run the FEM solve once.",
          "The next step unlocks automatically after a successful solve.",
        ],
        completeMode: "api_success",
      },
      {
        id: "numerical-inspect",
        cellId: "numerical",
        title: "Inspect Numerical Result",
        subtitle: "Review deformation scale, stress response, and the solver summary.",
        controlsTitle: "Numerical Reflection",
        controlsSubtitle: "Keep the latest FEM result on screen and decide what it teaches you.",
        requirements: [
          "Inspect the latest deformation and stress field.",
          "Use this result as the trust baseline for later PINN comparison.",
          "Continue when the baseline feels clear.",
        ],
        completeMode: "manual",
      },
    ],
  },
  {
    id: "pinn",
    title: "PINN Cell",
    description: "Reuse the same geometry to preview collocation, train the PINN, and compare back to FEM.",
    checkpoints: [
      {
        id: "pinn-preview",
        cellId: "pinn",
        title: "Preview Collocation Points",
        subtitle: "Explore geometry, sampling, and point density before training.",
        controlsTitle: "PINN Preview Controls",
        controlsSubtitle: "Configure geometry and collocation first. Training controls appear in the next step.",
        requirements: [
          "Adjust geometry and sampling.",
          "Inspect the collocation cloud.",
          "Continue when you are ready to train.",
        ],
        completeMode: "manual",
      },
      {
        id: "pinn-train",
        cellId: "pinn",
        title: "Train PINN",
        subtitle: "Run training and inspect the live loss and stress plots.",
        controlsTitle: "PINN Training Controls",
        controlsSubtitle: "Use the existing live training workflow inside this checkpoint.",
        requirements: [
          "Start or stop training as needed.",
          "Watch the stress map and loss curves update in place.",
          "Continue after you have seen one run.",
        ],
        completeMode: "manual",
      },
      {
        id: "pinn-compare",
        cellId: "pinn",
        title: "Compare Against FEM",
        subtitle: "Reserved for a later FEM-versus-PINN comparison view.",
        controlsTitle: "Comparison Checkpoint",
        controlsSubtitle: "This shell space is ready for future comparison data.",
        requirements: [
          "Use this step as the future comparison landing zone.",
          "Automatic comparison checks can be added later.",
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

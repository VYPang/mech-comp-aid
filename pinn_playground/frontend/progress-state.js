const STORAGE_KEY = "pinn-playground-checkpoint-shell-v2";

export const checkpointGroups = [
  {
    id: "numerical",
    title: "Numerical Cell",
    description: "Work through one guided FEM session, then carry that baseline into the PINN.",
    checkpoints: [
      {
        id: "numerical-session",
        cellId: "numerical",
        title: "Numerical Task Session",
        subtitle: "Define one FEM case, tune the mesh, solve it, then perturb material stiffness and solve again.",
        controlsTitle: "Numerical Workspace",
        controlsSubtitle: "Use one workspace for geometry, mesh preview, FEM solving, and reflection.",
        tasks: [
          {
            id: "define-geometry",
            title: "Pick geometry",
            question: "Which frame layout would you like to use?",
          },
          {
            id: "define-loading-patch",
            title: "Define loading position and width",
            question: "How do load position and width affect where force enters the frame?",
          },
          {
            id: "set-mesh-density",
            title: "Set Structured Cells per Side to 80",
            question: "What is affected in the plot when you change the mesh density?",
          },
          {
            id: "run-baseline-result",
            title: "Run the FEM",
            question: "After the solve, do the largest deformation and stress regions appear in the same place?",
          },
          {
            id: "change-young-run-result",
            title: "Change Young's Modulus to 211000 and run again",
            question: "What changes do you observe in the deformation and stress patterns?",
          },
        ],
        completeMode: "task_list",
      },
    ],
  },
  {
    id: "pinn",
    title: "PINN Cell",
    description: "Reuse the same geometry to preview collocation, train the PINN, and compare back to FEM.",
    checkpoints: [
      {
        id: "pinn-tutorial",
        cellId: "pinnTutorial",
        title: "PINN Tutorial",
        subtitle: "From numerical methods to physics-informed deep learning, with seven interactive figures.",
        controlsTitle: "Tutorial Sections",
        controlsSubtitle: "Jump to any section, then mark complete when you have read through the figures.",
        tasks: [],
        requirements: [
          "Read each tutorial section.",
          "Try the interactive figure controls.",
          "Continue when the seven core ideas feel concrete.",
        ],
        completeMode: "manual",
      },
      {
        id: "pinn-preview",
        cellId: "pinn",
        title: "Preview Collocation Points",
        subtitle: "Explore geometry, sampling, and point density before training.",
        controlsTitle: "PINN Preview Controls",
        controlsSubtitle: "Configure geometry and collocation first. Training controls appear in the next step.",
        tasks: [],
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
        tasks: [],
        requirements: [
          "Start or stop training as needed.",
          "Watch the stress map and loss curves update in place.",
          "Continue after you have seen one run.",
        ],
        completeMode: "manual",
      },
      {
        id: "pinn-teacher",
        cellId: "pinn",
        title: "Teacher-Guided PINN",
        subtitle: "Train with sparse FEM displacement labels to lift the stress magnitude ceiling.",
        controlsTitle: "Teacher-Guided Training",
        controlsSubtitle: "Pick how many FEM displacement samples are injected per region, then retrain from scratch.",
        tasks: [],
        requirements: [
          "Choose how many teacher points land in the interior, on the free boundary, and on the load patch.",
          "Start a guided training run and watch the teacher loss trace.",
          "Compare against the plain PINN result from the previous checkpoint.",
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

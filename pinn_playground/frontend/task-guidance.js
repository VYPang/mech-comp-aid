const DEFAULT_GUIDANCE = Object.freeze({
  shortInstruction: "Complete the active task, then continue when the checkpoint accepts it.",
  primaryAction: null,
  secondaryActions: [],
  explanation: "Each task prepares the next step in the learning path.",
  blockedMessage: "Complete the active task before continuing.",
});

const TASK_GUIDANCE = Object.freeze({
  "define-geometry": Object.freeze({
    shortInstruction: "Choose the frame layout, then confirm where the load enters the structure.",
    primaryAction: Object.freeze({
      type: "highlight-control",
      label: "Find geometry selector",
      targetSelector: "#fem-geometry",
      regionSelector: "#controls-form",
    }),
    details: Object.freeze({
      what: "Pick Base Frame, Single Diagonal, or X-Brace.",
      where: "Controls -> Geometry and Mesh -> Geometry.",
      why: "The layout changes the load path. A diagonal or X-brace adds reinforcement across the opening, so part of the force can travel through the brace instead of bending only around the frame; this redistributes deformation and stress hot spots.",
    }),
    blockedMessage: "To continue: pick a geometry layout.",
  }),
  "define-loading-patch": Object.freeze({
    shortInstruction: "Move or resize the top load patch and watch the boundary preview update.",
    primaryAction: Object.freeze({
      type: "highlight-control",
      label: "Find load sliders",
      targetSelector: "#fem-patch-center",
      regionSelector: "#controls-form",
      secondarySelector: "#fem-patch-width",
    }),
    details: Object.freeze({
      what: "Adjust Patch Center and Patch Width.",
      where: "Controls -> Top Load Patch.",
      why: "The traction patch defines where force enters the frame; moving it changes support reaction and stress concentration.",
    }),
    blockedMessage: "To continue: adjust the top load patch controls.",
  }),
  "set-mesh-density": Object.freeze({
    shortInstruction: "Set Structured Cells per Side to 80, then run the FEM solve before continuing.",
    primaryAction: Object.freeze({
      type: "highlight-control",
      label: "Find mesh slider",
      targetSelector: "#fem-n-cells",
      regionSelector: "#controls-form",
    }),
    details: Object.freeze({
      what: "Move the Structured Cells per Side slider to 80.",
      where: "Controls -> Run FEM Solve -> Structured Cells per Side.",
      why: "A finer mesh gives the approximation more local detail near corners, braces, and the load patch.",
    }),
    blockedMessage: "To continue: set Structured Cells per Side to 80 and run the FEM solve.",
  }),
  "run-baseline-result": Object.freeze({
    shortInstruction: "Run the FEM solve and compare deformation with von Mises stress.",
    primaryAction: Object.freeze({
      type: "highlight-control",
      label: "Find FEM solve button",
      targetSelector: "#fem-solve-button",
      regionSelector: "#controls-form",
    }),
    details: Object.freeze({
      what: "Click Run FEM Solve, then inspect the deformed mesh and stress map.",
      where: "Controls -> Run FEM Solve -> Run FEM Solve button.",
      why: "The solved field becomes the trusted numerical baseline for judging later PINN outputs.",
    }),
    blockedMessage: "To continue: run the FEM solve at the requested mesh density.",
  }),
  "change-young-run-result": Object.freeze({
    shortInstruction: "Change Young's Modulus to 211000 and run the FEM solve again.",
    primaryAction: Object.freeze({
      type: "highlight-control",
      label: "Find Young's Modulus",
      targetSelector: "#fem-young",
      regionSelector: "#controls-form",
    }),
    details: Object.freeze({
      what: "Set Young's Modulus to 211000, then rerun the solve.",
      where: "Controls -> Material Defaults -> Young's Modulus.",
      why: "For this linear traction problem, stiffness strongly affects displacement magnitude while geometry and loading shape the stress path.",
    }),
    blockedMessage: "To continue: set Young's Modulus to 211000 and rerun the solve.",
  }),
  "define-collocation-points": Object.freeze({
    shortInstruction: "Adjust both Domain Points and Boundary Points before training.",
    primaryAction: Object.freeze({
      type: "highlight-control",
      label: "Find collocation sliders",
      targetSelector: "#pinn-n-domain",
      secondarySelector: "#pinn-n-boundary",
      regionSelector: "#controls-form",
    }),
    details: Object.freeze({
      what: "Change Domain Points and Boundary Points.",
      where: "Controls -> Collocation Points.",
      why: "These points decide where the PDE residual and boundary losses are evaluated during PINN training.",
    }),
    blockedMessage: "To continue: adjust both Domain Points and Boundary Points.",
  }),
  "run-pinn-training": Object.freeze({
    shortInstruction: "Start a PINN training run and wait for it to finish.",
    primaryAction: Object.freeze({
      type: "highlight-control",
      label: "Find training button",
      targetSelector: "#pinn-start-button",
      regionSelector: "#controls-form",
    }),
    details: Object.freeze({
      what: "Click Start PINN Training and watch the loss curve and stress map update.",
      where: "Controls -> Run Control -> Start PINN Training.",
      why: "The baseline run shows how well physics-only training satisfies the same frame problem as FEM.",
    }),
    blockedMessage: "To continue: finish one baseline PINN training run.",
  }),
  "compare-with-numerical": Object.freeze({
    shortInstruction: "Open the comparison view and inspect where PINN disagrees with FEM.",
    primaryAction: Object.freeze({
      type: "open-tab",
      label: "Open comparison view",
      targetSelector: "#pinn-tab-btn-compare-fem",
      regionSelector: "#bottom-panel",
    }),
    details: Object.freeze({
      what: "Scroll to the bottom panel, open Compare with Numerical, and compare the FEM stress map with the PINN error map.",
      where: "Bottom panel -> Compare with Numerical tab.",
      why: "FEM is the trusted numerical baseline for judging whether the PINN field is physically credible.",
    }),
    blockedMessage: "To continue: open the Compare with Numerical tab in the bottom panel.",
  }),
  "train-interior-teacher-only": Object.freeze({
    shortInstruction: "Run a teacher-guided case using interior teacher points only.",
    primaryAction: Object.freeze({
      type: "highlight-control",
      label: "Find interior teacher points",
      targetSelector: "#pinn-teacher-interior",
      regionSelector: "#controls-form",
    }),
    details: Object.freeze({
      what: "Set interior teacher points above zero, keep boundary and load-patch teacher points at zero, then train.",
      where: "Controls -> Teacher Supervision.",
      why: "Sparse FEM displacement anchors can stabilize the learned field without replacing the physics losses.",
    }),
    blockedMessage: "To continue: finish one training run with interior teacher points only.",
  }),
  "train-load-patch-teacher-only": Object.freeze({
    shortInstruction: "Run a teacher-guided case using load-patch teacher points only.",
    primaryAction: Object.freeze({
      type: "highlight-control",
      label: "Find load-patch teacher points",
      targetSelector: "#pinn-teacher-load-patch",
      regionSelector: "#controls-form",
    }),
    details: Object.freeze({
      what: "Set load-patch teacher points above zero, keep interior and boundary teacher points at zero, then train.",
      where: "Controls -> Teacher Supervision -> Load Patch Teacher Points.",
      why: "The load patch uses Neumann traction supervision, so direct displacement anchors there test a different kind of guidance.",
    }),
    blockedMessage: "To continue: finish one training run with load-patch teacher points only.",
  }),
});

export function getTaskGuidance(taskId) {
  return normalizeGuidance(TASK_GUIDANCE[taskId] ?? DEFAULT_GUIDANCE);
}

export function getActiveTaskGuidance(checkpoint, runtimeProgress) {
  const tasks = Array.isArray(checkpoint?.tasks) ? checkpoint.tasks : [];
  if (!tasks.length) {
    return null;
  }
  const activeTaskId = runtimeProgress?.activeTaskId
    ?? tasks.find((task) => runtimeProgress?.tasks?.[task.id]?.status === "active")?.id
    ?? tasks[0]?.id;
  const activeIndex = Math.max(0, tasks.findIndex((task) => task.id === activeTaskId));
  const task = tasks[activeIndex] ?? tasks[0];
  return {
    task,
    index: activeIndex + 1,
    total: tasks.length,
    guidance: getTaskGuidance(task.id),
  };
}

export function summarizeTaskProgress(checkpoint, runtimeProgress) {
  const tasks = Array.isArray(checkpoint?.tasks) ? checkpoint.tasks : [];
  const items = tasks.map((task, index) => {
    const status = runtimeProgress?.tasks?.[task.id]?.status
      ?? (index === 0 ? "active" : "locked");
    return {
      id: task.id,
      title: task.title,
      question: task.question,
      status,
      selectable: status === "completed" || status === "active",
    };
  });
  return {
    items,
    completedCount: items.filter((item) => item.status === "completed").length,
    totalCount: items.length,
  };
}

export function getTaskStatusMessage(taskId, status) {
  if (status === "completed") {
    return "Completed: this step is already satisfied. You can review the explanation or select the current task marker to continue.";
  }
  if (status === "locked") {
    return "Locked: finish the previous task before working on this step.";
  }
  return getTaskGuidance(taskId).blockedMessage;
}

function normalizeGuidance(guidance) {
  if (guidance.explanation) {
    return guidance;
  }
  return Object.freeze({
    shortInstruction: guidance.shortInstruction,
    primaryAction: guidance.primaryAction,
    secondaryActions: [],
    explanation: guidance.details?.why ?? DEFAULT_GUIDANCE.explanation,
    blockedMessage: guidance.blockedMessage,
  });
}

export function buildNumericalGuideSections({ controls, latestSolve, currentCheckpointId, solveStatus }) {
  const notice = [];
  const tryNext = [];
  const why = [];
  const nCells = Number(controls.nCells);
  const patchWidth = Number(controls.patchWidth);
  const geometry = controls.geometry;
  const frameThickness = Number(controls.frameThickness);

  if (nCells < 24) {
    notice.push("The mesh is still coarse, so corners and load concentrations will be smoothed out.");
    tryNext.push("Increase cells per side if you want a sharper stress picture.");
  }
  if (patchWidth < 0.10) {
    notice.push("The top load patch is narrow, so the force is more localized.");
  }
  if (frameThickness > 0.24) {
    notice.push("This is a thick frame, so added reinforcement may look less dramatic.");
  }
  if (geometry === "diagonal") {
    notice.push("A single diagonal brace creates one main alternate load path.");
  }
  if (geometry === "x_brace") {
    notice.push("The X-brace creates the stiffest reinforced option in this set.");
  }
  if (latestSolve && currentCheckpointId !== "numerical-preview") {
    notice.push(
      `Latest solve: max von Mises ${formatNumber(latestSolve.summary.max_von_mises)}, max displacement ${formatNumber(latestSolve.summary.max_displacement)}.`,
    );
    why.push("Use this solved field as the numerical reference before trusting a PINN prediction.");
  }

  if (solveStatus === "stale") {
    tryNext.push("Run the FEM solve again so the result matches the current preview.");
  }

  if (currentCheckpointId === "numerical-session") {
    if (latestSolve) {
      tryNext.push("Change one setting at a time, rerun the solve, and compare the field response.");
    } else {
      tryNext.push("Finish the active task, then run the FEM solve from the same workspace.");
    }
    why.push("This single session ties setup, solving, and reflection into one cause-and-effect loop.");
  } else if (currentCheckpointId === "numerical-preview") {
    why.push("This step is about reading support and load placement before asking the solver for numbers.");
  } else if (currentCheckpointId === "numerical-solve") {
    tryNext.push("Solve once, then compare the deformed shape against the stress hot spots.");
    why.push("A fast numerical baseline helps students judge whether a later PINN answer looks believable.");
  } else {
    tryNext.push("Compare where the frame deforms most against where the stress field peaks.");
    why.push("This reflection step prepares the mental model you will carry into PINN training.");
  }

  if (!notice.length) {
    notice.push("The numerical preview is ready. Check the support and top load placement before moving on.");
  }

  return [
    { title: "What to notice", items: notice.slice(0, 3) },
    { title: "What to try", items: tryNext.slice(0, 2) },
    { title: "Why it matters", items: why.slice(0, 2) },
  ];
}

export function buildPinnGuideSections({ config, latestMetrics, currentCheckpointId, isTraining }) {
  const notice = [];
  const tryNext = [];
  const why = [];

  if (!config.normalize_inputs) {
    notice.push("Normalization is off, which usually makes optimization less stable.");
  }
  if (config.n_domain < 400) {
    notice.push("Domain density is low, so the interior field may look patchy or misleading.");
  }
  if (config.n_boundary < 80) {
    notice.push("Boundary sampling is sparse, so supports and loading may be learned less reliably.");
  }
  if (config.sampling_strategy === "adaptive") {
    notice.push("Adaptive sampling concentrates more points near corners and brace joints.");
  }
  if (config.problem.geometry.geometry === "diagonal") {
    notice.push("A single diagonal brace creates one alternate load path across the opening.");
  }
  if (config.problem.geometry.geometry === "x_brace") {
    notice.push("The X-brace is usually the stiffest reinforcement in this geometry set.");
  }
  if (config.problem.load.patch_width < 0.1) {
    notice.push("The traction patch is narrow, so the learned stress field should become more localized near the top edge.");
  }
  if (config.problem.geometry.frame_thickness > 0.26) {
    notice.push("A thicker frame leaves a smaller opening, which can reduce the visible effect of reinforcement changes.");
  }
  if (config.pde_weight < 0.8) {
    tryNext.push("Raise PDE weight if the model fits the boundary but struggles inside the domain.");
  }
  if (config.bc_weight < 1.0) {
    tryNext.push("Raise BC weight if support or loading conditions look poorly enforced.");
  }
  if (config.teacher.enabled && config.teacher.n_load_patch === 0) {
    tryNext.push("Add a few load-patch teacher points to test the Neumann-loading explanation directly.");
  }

  if (latestMetrics) {
    const { total_loss: totalLoss, pde_loss: pdeLoss, bc_loss: bcLoss } = latestMetrics;
    if (totalLoss > 5) {
      notice.push("Total loss is still high, so the PINN has not settled yet.");
    }
    if (bcLoss > pdeLoss * 2) {
      notice.push("Boundary loss dominates, so the supports or loading are harder than the interior PDE right now.");
    }
    if (pdeLoss > bcLoss * 2) {
      notice.push("Physics loss dominates, so equilibrium is the harder part of the problem right now.");
    }
    why.push(`Latest loss snapshot: total ${formatMetric(totalLoss)}, PDE ${formatMetric(pdeLoss)}, BC ${formatMetric(bcLoss)}.`);
  }

  if (currentCheckpointId === "pinn-preview") {
    notice.push("This step is for understanding the point cloud before you train.");
    tryNext.push("Compare uniform and adaptive sampling before moving on.");
    why.push("Seeing the collocation cloud first makes it easier to judge whether the PINN is sampling the same structural case as the numerical baseline.");
  } else if (isTraining) {
    tryNext.push("Let the run progress for a few epochs before judging the stress map.");
    why.push("The live curves show whether the PINN is balancing equilibrium with the shared support and traction boundary conditions.");
  } else if (currentCheckpointId === "pinn-train") {
    tryNext.push("Change one setting at a time, then start another run to see what moved the curves.");
    why.push("Short, repeated experiments help students learn which settings change convergence.");
  } else if (currentCheckpointId === "pinn-teacher") {
    why.push("Teacher guidance should be read as sparse displacement supervision added to the same traction-driven benchmark.");
  }

  if (!notice.length) {
    notice.push("This setup is balanced enough to begin a teaching run.");
  }

  if (!why.length) {
    why.push("The goal is not only to train a PINN, but to judge when its answer is believable.");
  }

  return [
    { title: "What to notice", items: notice.slice(0, 3) },
    { title: "What to try", items: tryNext.slice(0, 2) },
    { title: "Why it matters", items: why.slice(0, 2) },
  ];
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)) {
    return value.toExponential(3);
  }
  return value.toFixed(4);
}

function formatMetric(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)) {
    return value.toExponential(2);
  }
  return value.toFixed(3);
}

import { createProgressStore } from "./progress-state.js";
import { createAppShell } from "./shell.js";

function bootstrap() {
  const ui = {
    controlsForm: document.getElementById("controls-form"),
    statusText: document.getElementById("status-text"),
    learningPath: document.getElementById("learning-path"),
    workspaceCellLabel: document.getElementById("workspace-cell-label"),
    workspaceTitle: document.getElementById("workspace-title"),
    workspaceSubtitle: document.getElementById("workspace-subtitle"),
    workspaceBadge: document.getElementById("workspace-badge"),
    controlsTitle: document.getElementById("controls-title"),
    controlsSubtitle: document.getElementById("controls-subtitle"),
    controlsSummary: document.getElementById("controls-summary"),
    coachSubtitle: document.getElementById("coach-subtitle"),
    requirementsList: document.getElementById("requirements-list"),
    guideBox: document.getElementById("guide-box"),
    nextStepButton: document.getElementById("next-step-button"),
    resetProgressButton: document.getElementById("reset-progress-button"),
    leftPlot: "left-plot",
    leftPlotTitle: document.getElementById("left-plot-title"),
    leftPlotSummary: document.getElementById("left-plot-summary"),
    rightPlot: "right-plot",
    rightPlotTitle: document.getElementById("right-plot-title"),
    rightPlotSummary: document.getElementById("right-plot-summary"),
    bottomPlot: "bottom-plot",
    bottomPlotTitle: document.getElementById("bottom-plot-title"),
    bottomPlotSummary: document.getElementById("bottom-plot-summary"),
  };

  const progressStore = createProgressStore();
  createAppShell({ ui, progressStore });
}

bootstrap();

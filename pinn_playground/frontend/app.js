import { createProgressStore } from "./progress-state.js?v=checkpoint-shell-15";
import { createAppShell } from "./shell.js?v=checkpoint-shell-20";
import { createTutor } from "./tutor.js?v=checkpoint-shell-17";

function bootstrap() {
  const ui = {
    mainLayout: document.getElementById("main-layout"),
    controlsForm: document.getElementById("controls-form"),
    statusPill: document.getElementById("status-pill"),
    statusText: document.getElementById("status-text"),
    statusDetail: document.getElementById("status-detail"),
    learningPath: document.getElementById("learning-path"),
    learningPathAside: document.getElementById("learning-path-aside"),
    learningPathPanel: document.getElementById("learning-path-panel"),
    learningPathBody: document.getElementById("learning-path-body"),
    learningPathDescription: document.getElementById("learning-path-description"),
    workspaceCellLabel: document.getElementById("workspace-cell-label"),
    workspaceTitle: document.getElementById("workspace-title"),
    workspaceSubtitle: document.getElementById("workspace-subtitle"),
    workspaceProgress: document.getElementById("workspace-progress"),
    workspaceBadge: document.getElementById("workspace-badge"),
    controlsTitle: document.getElementById("controls-title"),
    controlsSubtitle: document.getElementById("controls-subtitle"),
    controlsSummary: document.getElementById("controls-summary"),
    setupPreviewShell: document.getElementById("setup-preview-shell"),
    setupPreviewTitle: document.getElementById("setup-preview-title"),
    setupPreviewSummary: document.getElementById("setup-preview-summary"),
    setupPreviewTabs: document.getElementById("setup-preview-tabs"),
    setupPreviewPlot: "setup-preview-plot",
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
  const shell = createAppShell({ ui, progressStore });
  createTutor({ ui, runtimeState: shell.runtimeState, progressStore });
}

bootstrap();

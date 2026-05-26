// Global AI tutor panel.
//
// Architecture:
//   - One conversation thread shared across the whole app.
//   - Two modes: "ask" (read-only) and "agent" (may propose control updates).
//   - The panel is mounted imperatively from this module so it does not depend
//     on changes to index.html or shell.js beyond a single bootstrap call.
//   - Live application state is packed at send-time, not stored in the
//     conversation thread. This keeps the model's view of the world fresh
//     every turn and lets Clear Chat wipe the visible thread without losing
//     the user's app state.

import { clearTutorChat, fetchTutorStatus, postTutorChat } from "./api.js?v=checkpoint-shell-15";

const PINN_CONTROL_PREFIX = "pinn-";
const FEM_CONTROL_PREFIX = "fem-";
const TUTOR_SESSION_ID = "global";
const SELECT_VALUE_ALIASES = Object.freeze({
  geometry: Object.freeze({
    base: "base",
    baseframe: "base",
    frame: "base",
    diagonal: "diagonal",
    singlediagonal: "diagonal",
    diagonalbrace: "diagonal",
    cross: "x_brace",
    crossbrace: "x_brace",
    x: "x_brace",
    xbrace: "x_brace",
    xbraced: "x_brace",
  }),
});

// Special-case mapping where the camelCase control key does not match its
// DOM id by simple kebab-case conversion. Extend this map as new controls
// are added that violate the convention.
const CONTROL_ID_OVERRIDES = Object.freeze({
  samplingStrategy: "adaptive-sampling",
});

export function createTutor({ ui, runtimeState, progressStore }) {
  const state = {
    open: false,
    mode: "ask",
    thinkMode: false,
    busy: false,
    history: [],
    pendingSuggestion: null,
    pendingHighlightKeys: [],
    tutorStatus: null,
  };

  const dom = buildDom();
  document.body.appendChild(dom.backdrop);
  document.body.appendChild(dom.panel);
  injectLauncherButton(dom.launcher, ui);

  dom.launcher.addEventListener("click", () => toggle());
  dom.closeButton.addEventListener("click", () => close());
  dom.backdrop.addEventListener("click", () => close());
  dom.clearButton.addEventListener("click", () => void clearChat());
  dom.modeAsk.addEventListener("click", () => setMode("ask"));
  dom.modeAgent.addEventListener("click", () => setMode("agent"));
  dom.thinkToggle.addEventListener("click", () => toggleThinkMode());

  dom.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = dom.input.value.trim();
    if (!text || state.busy) {
      return;
    }
    dom.input.value = "";
    void send(text);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.open) {
      close();
    }
  });
  document.addEventListener("pinn:tutorial-context-change", () => renderContextLabel());
  ui.controlsForm?.addEventListener("input", () => syncAppliedHighlights());
  ui.controlsForm?.addEventListener("change", () => syncAppliedHighlights());

  renderContextLabel();
  renderHistory();
  renderModePills();
  renderThinkToggle();
  void refreshTutorStatus();

  // Refresh the context label whenever the active checkpoint changes so the
  // user can see what the tutor will treat as live state on their next turn.
  progressStore.subscribe(() => {
    renderContextLabel();
  });

  return {
    open,
    close,
    toggle,
    clearChat,
  };

  // ------------------------------------------------------------------
  // Panel construction
  // ------------------------------------------------------------------

  function buildDom() {
    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "tutor-launcher";
    launcher.innerHTML = `
      <span class="tutor-launcher-dot" aria-hidden="true"></span>
      <span class="tutor-launcher-label">Open Tutor</span>
      <span class="tutor-launcher-hint">Ask · Agent</span>
    `;

    const backdrop = document.createElement("div");
    backdrop.className = "tutor-backdrop";
    backdrop.hidden = true;

    const panel = document.createElement("aside");
    panel.className = "tutor-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Global Tutor");
    panel.hidden = true;
    panel.innerHTML = `
      <header class="tutor-header">
        <div class="tutor-header-titles">
          <p class="tutor-eyebrow">Global Tutor</p>
          <p class="tutor-context-label" data-tutor-context>Loading context…</p>
          <p class="tutor-model-status" data-tutor-model-status>Checking local model…</p>
        </div>
        <button type="button" class="tutor-close" data-tutor-close aria-label="Close tutor">✕</button>
      </header>
      <div class="tutor-toolbar">
        <div class="tutor-mode-switch" role="tablist" aria-label="Tutor mode">
          <button type="button" class="tutor-mode-pill" data-tutor-mode-ask role="tab">Ask</button>
          <button type="button" class="tutor-mode-pill" data-tutor-mode-agent role="tab">Agent</button>
        </div>
        <div class="tutor-toolbar-actions">
          <button type="button" class="tutor-think-toggle" data-tutor-think-toggle>Think Off</button>
          <button type="button" class="tutor-clear" data-tutor-clear>Clear Chat</button>
        </div>
      </div>
      <div class="tutor-thread" data-tutor-thread></div>
      <form class="tutor-composer" data-tutor-form>
        <textarea
          class="tutor-input"
          data-tutor-input
          rows="2"
          placeholder="Ask about controls, metrics, or what to try next…"
        ></textarea>
        <div class="tutor-composer-row">
          <span class="tutor-state-hint">Live workspace state is attached automatically.</span>
          <button type="submit" class="tutor-send" data-tutor-send>Send</button>
        </div>
      </form>
    `;

    return {
      launcher,
      backdrop,
      panel,
      closeButton: panel.querySelector("[data-tutor-close]"),
      clearButton: panel.querySelector("[data-tutor-clear]"),
      thinkToggle: panel.querySelector("[data-tutor-think-toggle]"),
      modeAsk: panel.querySelector("[data-tutor-mode-ask]"),
      modeAgent: panel.querySelector("[data-tutor-mode-agent]"),
      contextLabel: panel.querySelector("[data-tutor-context]"),
      modelStatus: panel.querySelector("[data-tutor-model-status]"),
      thread: panel.querySelector("[data-tutor-thread]"),
      form: panel.querySelector("[data-tutor-form]"),
      input: panel.querySelector("[data-tutor-input]"),
      sendButton: panel.querySelector("[data-tutor-send]"),
    };
  }

  function injectLauncherButton(launcher, ui) {
    // Place the launcher directly above the Task Panel so it reads as the
    // next obvious action near the guided work area.
    const taskPanelSection = ui.requirementsList?.closest("section")
      ?? ui.coachSubtitle?.closest("section")
      ?? document.querySelector("aside section");
    if (!taskPanelSection || !taskPanelSection.parentElement) {
      document.body.appendChild(launcher);
      return;
    }
    const wrapper = document.createElement("div");
    wrapper.className = "tutor-launcher-wrap";
    wrapper.appendChild(launcher);
    taskPanelSection.parentElement.insertBefore(wrapper, taskPanelSection);
  }

  // ------------------------------------------------------------------
  // Panel open/close + chrome
  // ------------------------------------------------------------------

  function open() {
    state.open = true;
    dom.panel.hidden = false;
    dom.backdrop.hidden = false;
    requestAnimationFrame(() => {
      dom.panel.classList.add("tutor-panel-open");
      dom.backdrop.classList.add("tutor-backdrop-open");
    });
    renderContextLabel();
    void refreshTutorStatus();
    dom.input.focus();
  }

  function close() {
    state.open = false;
    dom.panel.classList.remove("tutor-panel-open");
    dom.backdrop.classList.remove("tutor-backdrop-open");
    setTimeout(() => {
      if (!state.open) {
        dom.panel.hidden = true;
        dom.backdrop.hidden = true;
      }
    }, 200);
  }

  function toggle() {
    if (state.open) {
      close();
    } else {
      open();
    }
  }

  function setMode(mode) {
    if (mode !== "ask" && mode !== "agent") return;
    state.mode = mode;
    renderModePills();
  }

  function renderModePills() {
    dom.modeAsk.classList.toggle("tutor-mode-pill-active", state.mode === "ask");
    dom.modeAgent.classList.toggle("tutor-mode-pill-active", state.mode === "agent");
  }

  function toggleThinkMode() {
    state.thinkMode = !state.thinkMode;
    renderThinkToggle();
  }

  function renderThinkToggle() {
    dom.thinkToggle.textContent = state.thinkMode ? "Think On" : "Think Off";
    dom.thinkToggle.classList.toggle("tutor-think-toggle-active", state.thinkMode);
  }

  function renderContextLabel() {
    const checkpoint = progressStore.getActiveCheckpoint?.();
    const activeCellId = checkpoint?.cellId ?? "unknown";
    const cellLabel = cellLabelFor(activeCellId);
    const checkpointTitle = activeCellId === "pinnTutorial" && runtimeState.tutorial?.activeSectionTitle
      ? runtimeState.tutorial.activeSectionTitle
      : checkpoint?.title ?? "No checkpoint";
    dom.contextLabel.textContent = `${cellLabel} · ${checkpointTitle}`;
  }

  async function refreshTutorStatus() {
    try {
      state.tutorStatus = await fetchTutorStatus();
      renderTutorStatus();
    } catch (error) {
      state.tutorStatus = { ready: false, model: "unknown", endpoint: "unreachable" };
      dom.modelStatus.textContent = "Tutor backend status unavailable";
      dom.modelStatus.className = "tutor-model-status tutor-model-status-warn";
    }
  }

  function renderTutorStatus() {
    const status = state.tutorStatus;
    if (!status) return;
    const model = status.model ?? "unknown model";
    if (status.stub) {
      dom.modelStatus.textContent = "Stub mode · local model disabled";
      dom.modelStatus.className = "tutor-model-status tutor-model-status-warn";
      return;
    }
    if (status.ready) {
      dom.modelStatus.textContent = `Ready · ${model}`;
      dom.modelStatus.className = "tutor-model-status tutor-model-status-ready";
      return;
    }
    dom.modelStatus.textContent = `Waiting for local model · ${model}`;
    dom.modelStatus.className = "tutor-model-status tutor-model-status-warn";
  }

  function cellLabelFor(cellId) {
    switch (cellId) {
      case "numerical":
        return "Finite Element Method Cell";
      case "pinn":
        return "Physics-Informed Neural Network Cell";
      case "pinnTutorial":
        return "Tutorial Cell";
      default:
        return "Workspace";
    }
  }

  // ------------------------------------------------------------------
  // Thread rendering
  // ------------------------------------------------------------------

  function renderHistory() {
    if (!state.history.length) {
      dom.thread.innerHTML = `
        <div class="tutor-empty">
          <p class="tutor-empty-title">Hi! I am your PINN Playground tutor.</p>
          <p class="tutor-empty-copy">Ask anything about the current controls, metrics, or what to try next.
          Switch to <strong>Agent</strong> mode if you want me to propose concrete control changes (you still
          decide whether to apply them).</p>
        </div>
      `;
      return;
    }
    dom.thread.innerHTML = state.history
      .map((turn, index) => renderTurn(turn, index))
      .join("");
    bindTurnHandlers();
    renderTutorMath(dom.thread);
    dom.thread.scrollTop = dom.thread.scrollHeight;
  }

  function renderTurn(turn, index) {
    if (turn.role === "user") {
      return `
        <div class="tutor-bubble tutor-bubble-user">
          <div class="tutor-bubble-meta">You</div>
          <div class="tutor-bubble-body">${escapeHtml(turn.content)}</div>
        </div>
      `;
    }
    const suggestionBlock = turn.suggestion
      ? renderSuggestion(
        turn.suggestion,
        index,
        turn.applied,
        turn.dismissed,
        turn.highlightVisible ?? true,
      )
      : "";
    const citations = (turn.citations ?? [])
      .map((entry) => `<li><span class="tutor-citation-type">${escapeHtml(entry.type)}</span>${escapeHtml(entry.id)}${entry.summary ? ` · ${escapeHtml(entry.summary)}` : ""}</li>`)
      .join("");
    const citationsBlock = citations
      ? `<details class="tutor-citations"><summary>Citations</summary><ul>${citations}</ul></details>`
      : "";
    const warnings = (turn.warnings ?? [])
      .map((warning) => `<li>${escapeHtml(warning)}</li>`)
      .join("");
    const warningsBlock = warnings
      ? `<details class="tutor-warnings"><summary>Warnings</summary><ul>${warnings}</ul></details>`
      : "";
    return `
      <div class="tutor-bubble tutor-bubble-assistant">
        <div class="tutor-bubble-meta">Tutor${turn.mode ? ` · ${turn.mode}` : ""}</div>
        <div class="tutor-bubble-body">${renderMessageText(turn.content)}</div>
        ${suggestionBlock}
        ${citationsBlock}
        ${warningsBlock}
      </div>
    `;
  }

  function renderSuggestion(suggestion, index, applied, dismissed, highlightVisible = true) {
    const rows = Object.entries(suggestion.controls)
      .map(([key, proposed]) => {
        const current = readCurrentControlValue(key);
        const displayCurrent = current === null ? "—" : String(current);
        const displayProposed = String(proposed);
        return `
          <tr>
            <td class="tutor-suggestion-key">${escapeHtml(key)}</td>
            <td class="tutor-suggestion-from">${escapeHtml(displayCurrent)}</td>
            <td class="tutor-suggestion-to">${escapeHtml(displayProposed)}</td>
          </tr>
        `;
      })
      .join("");
    const status = applied
      ? `<span class="tutor-suggestion-status tutor-suggestion-status-applied">Applied</span>`
      : dismissed
        ? `<span class="tutor-suggestion-status tutor-suggestion-status-dismissed">Dismissed</span>`
        : "";
    const actions = applied
      ? `
        <div class="tutor-suggestion-actions">
          <button type="button" class="tutor-highlight-toggle" data-tutor-highlight-toggle="${index}">${highlightVisible ? "Hide highlights" : "Show highlights"}</button>
        </div>
      `
      : dismissed
        ? ""
      : `
        <div class="tutor-suggestion-actions">
          <button type="button" class="tutor-apply" data-tutor-apply="${index}">Apply changes</button>
          <button type="button" class="tutor-dismiss" data-tutor-dismiss="${index}">Dismiss</button>
        </div>
      `;
    return `
      <div class="tutor-suggestion">
        <div class="tutor-suggestion-head">
          <span class="tutor-suggestion-title">Proposed controls</span>
          ${status}
        </div>
        <p class="tutor-suggestion-rationale">${escapeHtml(suggestion.rationale)}</p>
        <table class="tutor-suggestion-table">
          <thead><tr><th>Control</th><th>Current</th><th>Proposed</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${actions}
      </div>
    `;
  }

  function bindTurnHandlers() {
    dom.thread.querySelectorAll("[data-tutor-apply]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.tutorApply);
        applySuggestion(index);
      });
    });
    dom.thread.querySelectorAll("[data-tutor-dismiss]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.tutorDismiss);
        dismissSuggestion(index);
      });
    });
    dom.thread.querySelectorAll("[data-tutor-highlight-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.tutorHighlightToggle);
        toggleSuggestionHighlights(index);
      });
    });
  }

  function renderMessageText(text) {
    const source = String(text ?? "");
    const markdown = window.marked;
    const sanitizer = window.DOMPurify;

    if (markdown?.parse && sanitizer?.sanitize) {
      const rendered = markdown.parse(source, {
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false,
      });
      return sanitizer.sanitize(rendered, {
        USE_PROFILES: { html: true },
      });
    }

    // Fallback formatter when the Markdown libraries are unavailable.
    const escaped = escapeHtml(source);
    return escaped
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  // ------------------------------------------------------------------
  // Sending and applying
  // ------------------------------------------------------------------

  async function send(text) {
    state.busy = true;
    dom.sendButton.disabled = true;
    dom.sendButton.textContent = "Thinking…";

    state.history.push({ role: "user", content: text });
    state.history.push({ role: "assistant", content: "…", pending: true, mode: state.mode });
    renderHistory();

    try {
      const payload = {
        mode: state.mode,
        thinkMode: state.thinkMode,
        sessionId: TUTOR_SESSION_ID,
        message: text,
        history: state.history
          .filter((turn) => !turn.pending)
          .slice(0, -1) // exclude the user message we just appended, server sees it in `message`
          .map((turn) => ({
            role: turn.role,
            content: turn.role === "assistant"
              ? plainContent(turn)
              : turn.content,
          })),
        appState: packAppState(),
      };
      const response = await postTutorChat(payload);
      // Replace the pending placeholder with the actual reply.
      state.history[state.history.length - 1] = {
        role: "assistant",
        content: response.message ?? "(empty reply)",
        suggestion: response.suggestion ?? null,
        citations: response.citations ?? [],
        warnings: response.warnings ?? [],
        mode: response.mode ?? state.mode,
        applied: false,
        dismissed: false,
      };
    } catch (error) {
      state.history[state.history.length - 1] = {
        role: "assistant",
        content: `Tutor request failed: ${error?.message ?? error}`,
        warnings: ["request_failed"],
        mode: state.mode,
      };
    } finally {
      state.busy = false;
      dom.sendButton.disabled = false;
      dom.sendButton.textContent = "Send";
      renderHistory();
    }
  }

  function plainContent(turn) {
    if (turn.suggestion) {
      const controls = Object.entries(turn.suggestion.controls || {})
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      return `${turn.content}\n[suggested controls: ${controls}]`;
    }
    return turn.content;
  }

  async function clearChat() {
    state.history = [];
    state.pendingSuggestion = null;
    state.pendingHighlightKeys = [];
    clearAllHighlights();
    renderHistory();
    try {
      await clearTutorChat({ sessionId: TUTOR_SESSION_ID });
    } catch (_error) {
      state.history.push({
        role: "assistant",
        content: "The visible chat was cleared, but the backend clear request did not complete.",
        warnings: ["clear_request_failed"],
        mode: state.mode,
      });
      renderHistory();
    }
  }

  function applySuggestion(index) {
    const turn = state.history[index];
    if (!turn || !turn.suggestion || turn.applied) return;
    const applied = [];
    const appliedControls = {};
    Object.entries(turn.suggestion.controls).forEach(([key, value]) => {
      const result = setControlValue(key, value);
      if (result.applied) {
        applied.push(key);
        appliedControls[key] = result.value;
        turn.suggestion.controls[key] = result.value;
      }
    });
    turn.applied = true;
    turn.highlightVisible = true;
    turn.appliedControls = appliedControls;
    syncAppliedHighlights();
    renderHistory();
  }

  function dismissSuggestion(index) {
    const turn = state.history[index];
    if (!turn) return;
    turn.dismissed = true;
    turn.highlightVisible = false;
    syncAppliedHighlights();
    renderHistory();
  }

  function toggleSuggestionHighlights(index) {
    const turn = state.history[index];
    if (!turn?.applied) return;
    turn.highlightVisible = !turn.highlightVisible;
    syncAppliedHighlights();
    renderHistory();
  }

  // ------------------------------------------------------------------
  // Live app state packing
  // ------------------------------------------------------------------

  function packAppState() {
    const checkpoint = progressStore.getActiveCheckpoint?.();
    const activeCellId = checkpoint?.cellId ?? null;
    const activeCheckpointId = checkpoint?.id ?? null;

    const controls = readAllControls();

    const pinnRuntime = runtimeState.pinn ?? {};
    const femRuntime = runtimeState.fem ?? {};

    const metricsSummary = summarizeMetrics(pinnRuntime.latestMetrics);
    const femBaselineAvailable = Boolean(pinnRuntime.femBaseline);
    const comparisonAvailable = Boolean(pinnRuntime.latestMetrics?.error_grid);
    const teacherUnlocked = Boolean(pinnRuntime.teacherUnlocked);

    const taskProgress = summarizeTaskProgress(activeCheckpointId, checkpoint);
    const visiblePage = summarizeVisiblePage(activeCellId, checkpoint);

    const notes = [];
    if (activeCellId !== "pinnTutorial" && femRuntime.savedControls) {
      notes.push("FEM cell has saved control values.");
    }
    if (activeCellId !== "pinnTutorial" && pinnRuntime.latestPreview?.counts) {
      const c = pinnRuntime.latestPreview.counts;
      notes.push(`Last PINN preview: n_domain=${c.n_domain}, n_boundary=${c.n_boundary}.`);
    }

    return {
      activeCellId,
      activeCheckpointId,
      checkpointTitle: checkpoint?.title ?? null,
      checkpointSubtitle: checkpoint?.subtitle ?? null,
      activeTask: taskProgress?.activeTask ?? null,
      checkpointRequirements: checkpoint?.requirements ?? [],
      visiblePage,
      activeBottomTab: pinnRuntime.activeBottomTab ?? null,
      controls,
      controlOptions: readSelectableControlOptions(),
      metricsSummary,
      taskProgress,
      femBaselineAvailable,
      comparisonAvailable,
      teacherUnlocked,
      notes,
    };
  }

  function summarizeVisiblePage(activeCellId, checkpoint) {
    if (activeCellId === "pinnTutorial" && runtimeState.tutorial?.active) {
      const tutorial = runtimeState.tutorial;
      return {
        kind: "tutorial",
        title: tutorial.title ?? checkpoint?.title ?? "PINN Tutorial",
        sectionId: tutorial.activeSectionId ?? null,
        sectionTitle: tutorial.activeSectionTitle ?? null,
        sectionIndex: tutorial.activeSectionIndex ?? null,
        sectionCount: tutorial.sectionCount ?? null,
        introText: truncateText(tutorial.introText, 700),
        bodyText: truncateText(tutorial.activeSectionText, 2200),
      };
    }
    return {
      kind: "workspace",
      title: checkpoint?.title ?? null,
      subtitle: checkpoint?.subtitle ?? null,
    };
  }

  function summarizeMetrics(metrics) {
    if (!metrics) return null;
    const summary = {};
    if (metrics.epoch !== undefined) summary.epoch = metrics.epoch;
    if (metrics.total_loss !== undefined) summary.total_loss = round(metrics.total_loss);
    if (metrics.pde_loss !== undefined) summary.pde_loss = round(metrics.pde_loss);
    if (metrics.bc_loss !== undefined) summary.bc_loss = round(metrics.bc_loss);
    if (metrics.teacher_loss !== undefined && metrics.teacher_loss !== null) {
      summary.teacher_loss = round(metrics.teacher_loss);
    }
    if (metrics.error_grid?.z) {
      const flat = metrics.error_grid.z.flat();
      const max = Math.max(...flat.map(Math.abs));
      summary.error_max_abs = round(max);
    }
    return summary;
  }

  function summarizeTaskProgress(checkpointId, checkpoint) {
    if (!checkpointId) return null;
    const checkpointTasks = Array.isArray(checkpoint?.tasks) ? checkpoint.tasks : [];
    const entry = runtimeState.taskProgress?.[checkpointId];
    const tasks = entry?.tasks ?? {};
    let activeTaskId = null;
    let activeTask = null;
    let completedCount = 0;
    let totalCount = checkpointTasks.length;

    checkpointTasks.forEach((task, index) => {
      const status = tasks[task.id]?.status ?? (index === 0 ? "active" : "locked");
      if (status === "completed") completedCount += 1;
      if (status === "active" && !activeTaskId) {
        activeTaskId = task.id;
        activeTask = { ...task, status, index: index + 1, total: totalCount };
      }
    });

    if (!checkpointTasks.length) {
      const taskEntries = Object.entries(tasks);
      totalCount = taskEntries.length;
      taskEntries.forEach(([id, info], index) => {
        if (info.status === "completed") completedCount += 1;
        if (info.status === "active" && !activeTaskId) {
          activeTaskId = id;
          activeTask = { id, title: id, question: "", status: info.status, index: index + 1, total: totalCount };
        }
      });
    }

    return {
      activeTaskId,
      activeTask,
      completedCount,
      totalCount,
      allComplete: totalCount > 0 && completedCount === totalCount,
    };
  }

  function readAllControls() {
    const out = {};
    if (!ui.controlsForm) return out;
    ui.controlsForm.querySelectorAll("input, select").forEach((element) => {
      const id = element.id;
      if (!id) return;
      const key = controlIdToKey(id);
      if (!key) return;
      if (element.type === "checkbox") {
        out[key] = Boolean(element.checked);
      } else {
        out[key] = element.value;
      }
    });
    return out;
  }

  function readSelectableControlOptions() {
    const out = {};
    if (!ui.controlsForm) return out;
    ui.controlsForm.querySelectorAll("select").forEach((element) => {
      const key = controlIdToKey(element.id);
      if (!key) return;
      out[key] = Array.from(element.options).map((option) => ({
        value: option.value,
        label: option.textContent?.trim() ?? option.value,
      }));
    });
    return out;
  }

  // ------------------------------------------------------------------
  // Control DOM helpers
  // ------------------------------------------------------------------

  function controlIdToKey(domId) {
    let stripped = null;
    if (domId.startsWith(PINN_CONTROL_PREFIX)) {
      stripped = domId.slice(PINN_CONTROL_PREFIX.length);
    } else if (domId.startsWith(FEM_CONTROL_PREFIX)) {
      stripped = domId.slice(FEM_CONTROL_PREFIX.length);
    } else {
      return null;
    }
    if (stripped.endsWith("-value")) return null;
    // Reverse the override map for special cases.
    for (const [key, value] of Object.entries(CONTROL_ID_OVERRIDES)) {
      if (value === stripped) return key;
    }
    return kebabToCamel(stripped);
  }

  function controlKeyToDomId(key) {
    if (CONTROL_ID_OVERRIDES[key]) {
      return [`${PINN_CONTROL_PREFIX}${CONTROL_ID_OVERRIDES[key]}`,
        `${FEM_CONTROL_PREFIX}${CONTROL_ID_OVERRIDES[key]}`];
    }
    const kebab = camelToKebab(key);
    return [`${PINN_CONTROL_PREFIX}${kebab}`, `${FEM_CONTROL_PREFIX}${kebab}`];
  }

  function readCurrentControlValue(key) {
    const candidates = controlKeyToDomId(key);
    for (const id of candidates) {
      const element = document.getElementById(id);
      if (!element) continue;
      if (element.type === "checkbox") return Boolean(element.checked);
      return element.value;
    }
    return null;
  }

  function setControlValue(key, value) {
    const candidates = controlKeyToDomId(key);
    for (const id of candidates) {
      const element = document.getElementById(id);
      if (!element) continue;
      if (element.type === "checkbox") {
        const checked = Boolean(value);
        element.checked = checked;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return { applied: true, value: checked };
      }
      if (element.tagName === "SELECT") {
        const resolved = resolveSelectOptionValue(element, key, value);
        if (resolved === null) {
          return { applied: false, value };
        }
        element.value = resolved;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return { applied: true, value: resolved };
      } else {
        const text = String(value);
        element.value = text;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return { applied: true, value: text };
      }
    }
    return { applied: false, value };
  }

  function syncAppliedHighlights() {
    clearAllHighlights();
    state.history.forEach((turn) => {
      if (!turn?.applied || !turn.highlightVisible || !turn.appliedControls) {
        return;
      }
      Object.entries(turn.appliedControls).forEach(([key, expectedValue]) => {
        if (isCurrentControlValueEqual(key, expectedValue)) {
          addControlHighlight(key);
        }
      });
    });
  }

  function clearAllHighlights() {
    document.querySelectorAll(".tutor-control-highlight").forEach((node) => {
      node.classList.remove("tutor-control-highlight");
    });
  }

  function addControlHighlight(key) {
    const element = findControlElement(key);
    if (!element) return;
    const target = element.closest(".field-input-wrap")
      ?? element.closest("label")
      ?? element.parentElement
      ?? element;
    target.classList.add("tutor-control-highlight");
  }

  function findControlElement(key) {
    const candidates = controlKeyToDomId(key);
    for (const id of candidates) {
      const element = document.getElementById(id);
      if (element) {
        return element;
      }
    }
    return null;
  }

  function isCurrentControlValueEqual(key, expectedValue) {
    const element = findControlElement(key);
    if (!element) return false;
    if (element.type === "checkbox") {
      return Boolean(element.checked) === Boolean(expectedValue);
    }
    return normalizeComparableValue(element.value) === normalizeComparableValue(expectedValue);
  }

  function resolveSelectOptionValue(element, key, rawValue) {
    const options = Array.from(element.options);
    const exact = String(rawValue).trim();
    if (options.some((option) => option.value === exact)) {
      return exact;
    }

    const normalized = normalizeComparableValue(rawValue);
    const aliasValue = SELECT_VALUE_ALIASES[key]?.[normalized] ?? null;
    const candidateValues = aliasValue ? [aliasValue, exact] : [exact];

    for (const candidate of candidateValues) {
      const match = options.find((option) => option.value === candidate);
      if (match) {
        return match.value;
      }
    }

    const normalizedMatch = options.find((option) => {
      const optionValue = normalizeComparableValue(option.value);
      const optionLabel = normalizeComparableValue(option.textContent ?? option.value);
      return optionValue === normalized || optionLabel === normalized;
    });
    return normalizedMatch?.value ?? null;
  }
}

// ----------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------

function kebabToCamel(value) {
  return value.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

function camelToKebab(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTutorMath(root) {
  const renderMath = window.renderMathInElement;
  if (!root || typeof renderMath !== "function") {
    return;
  }

  root.querySelectorAll(".tutor-bubble-assistant .tutor-bubble-body").forEach((node) => {
    renderMath(node, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\(", right: "\\)", display: false },
        { left: "$", right: "$", display: false },
      ],
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      strict: "ignore",
      throwOnError: false,
    });
  });
}

function normalizeComparableValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function round(value, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function truncateText(value, maxLength) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

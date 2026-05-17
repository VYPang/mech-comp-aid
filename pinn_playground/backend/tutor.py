"""AI tutor harness for the PINN Playground.

Design summary:
    The tutor harness is intentionally small and auditable. Each request runs
    through three stages:

    1. State packer
        Compresses the live frontend snapshot (active cell, checkpoint,
        controls, latest metrics, comparison availability) into a compact
        dictionary that fits comfortably in a model prompt.

    2. Retrieval broker
        Selects bounded extra context from server-side resources only:
        recommended setting presets keyed by checkpoint, and optional lesson
        excerpts. The model never reads the filesystem directly.

    3. Response validator
        The model is required to emit a single JSON object matching the
        TutorChatResponse schema. Parse failures trigger one retry. Schema
        failures collapse the suggestion to None so Agent mode never applies
        unvetted changes.

    The LLM call uses any OpenAI-compatible local server (Ollama, vLLM,
    llama.cpp server). Configuration comes from environment variables so the
    harness can be swapped without code changes.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class TutorChatMessage(BaseModel):
    """A single turn in the visible conversation thread."""

    role: Literal["user", "assistant"]
    content: str


class TutorAppState(BaseModel):
    """Compact snapshot of what the frontend currently knows.

    Everything here is intentionally optional so that early checkpoints with
    no metrics or no FEM baseline still produce a valid request. Raw plot
    arrays are deliberately excluded; the frontend should only forward
    summarized observations.
    """

    model_config = ConfigDict(extra="allow")

    activeCellId: str | None = None
    activeCheckpointId: str | None = None
    checkpointTitle: str | None = None
    checkpointSubtitle: str | None = None
    activeBottomTab: str | None = None
    activeTask: dict[str, Any] | None = None
    checkpointRequirements: list[str] = Field(default_factory=list)
    visiblePage: dict[str, Any] | None = None
    controls: dict[str, Any] = Field(default_factory=dict)
    controlOptions: dict[str, list[dict[str, str]]] = Field(default_factory=dict)
    metricsSummary: dict[str, Any] | None = None
    taskProgress: dict[str, Any] | None = None
    femBaselineAvailable: bool = False
    comparisonAvailable: bool = False
    teacherUnlocked: bool = False
    notes: list[str] = Field(default_factory=list)


class TutorChatRequest(BaseModel):
    """Tutor chat request sent from the frontend."""

    sessionId: str = "global"
    mode: Literal["ask", "agent"] = "ask"
    thinkMode: bool = False
    message: str
    history: list[TutorChatMessage] = Field(default_factory=list)
    appState: TutorAppState = Field(default_factory=TutorAppState)


class TutorClearRequest(BaseModel):
    """Request to clear a global tutor thread."""

    sessionId: str = "global"


class TutorSuggestion(BaseModel):
    """A structured Agent-mode proposal.

    `controls` keys are frontend control identifiers (camelCase like
    `nDomain`, `teacherWeight`). The frontend is responsible for mapping
    them onto the live DOM elements and showing them as proposed-before-apply.
    """

    rationale: str
    controls: dict[str, Any] = Field(default_factory=dict)
    highlightKeys: list[str] = Field(default_factory=list)


class TutorCitation(BaseModel):
    """Provenance for an answer fragment."""

    type: Literal["preset", "lesson", "checkpoint", "state"]
    id: str
    summary: str | None = None


class TutorChatResponse(BaseModel):
    """Validated response shown in the chat panel."""

    message: str
    suggestion: TutorSuggestion | None = None
    citations: list[TutorCitation] = Field(default_factory=list)
    mode: Literal["ask", "agent"] = "ask"
    modelInfo: dict[str, str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Configuration and resource loading
# ---------------------------------------------------------------------------


_PACKAGE_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_RECOMMENDATIONS_PATH = _PACKAGE_ROOT / "config" / "tutor_recommendations.json"
_DEFAULT_LESSON_EXCERPTS_PATH = _PACKAGE_ROOT / "config" / "tutor_lesson_excerpts.json"
_DEFAULT_OLLAMA_BASE = "http://localhost:11434"
_DEFAULT_OPENAI_BASE = f"{_DEFAULT_OLLAMA_BASE}/v1"
_QWEN_MODEL_CANDIDATES = (
    "qwen3.6:27b",
    "qwen3:30b-a3b",
    "qwen3:32b",
    "qwen2.5:32b",
)
_SESSION_SUMMARIES: dict[str, str] = {}
_PENDING_SUGGESTIONS: dict[str, TutorSuggestion] = {}
_SELECT_VALUE_ALIASES: dict[str, dict[str, str]] = {
    "geometry": {
        "base": "base",
        "baseframe": "base",
        "frame": "base",
        "diagonal": "diagonal",
        "singlediagonal": "diagonal",
        "diagonalbrace": "diagonal",
        "cross": "x_brace",
        "crossbrace": "x_brace",
        "x": "x_brace",
        "xbrace": "x_brace",
        "xbraced": "x_brace",
    }
}


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value


def _truthy_env(name: str) -> bool:
    value = _env(name)
    return value is not None and value.lower() in {"1", "true", "yes", "on"}


def _load_recommendations() -> dict[str, Any]:
    """Load the curated preset library used by the retrieval broker."""
    path_str = _env("TUTOR_RECOMMENDATIONS_PATH")
    path = Path(path_str) if path_str else _DEFAULT_RECOMMENDATIONS_PATH
    if not path.is_file():
        return {"version": 0, "presets": []}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {"version": 0, "presets": []}


def _load_lesson_excerpts() -> dict[str, Any]:
    """Load curated teaching snippets used by the retrieval broker."""
    path_str = _env("TUTOR_LESSON_EXCERPTS_PATH")
    path = Path(path_str) if path_str else _DEFAULT_LESSON_EXCERPTS_PATH
    if not path.is_file():
        return {"version": 0, "excerpts": []}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {"version": 0, "excerpts": []}


# ---------------------------------------------------------------------------
# Retrieval broker
# ---------------------------------------------------------------------------


def _select_presets(checkpoint_id: str | None) -> list[dict[str, Any]]:
    """Return curated presets that are relevant to the active checkpoint.

    The broker is intentionally narrow: it returns presets whose
    `checkpointIds` list contains the active id. The model never sees the
    full library, and tutorial-only checkpoints receive no unrelated presets.
    """
    library = _load_recommendations().get("presets", [])
    if not checkpoint_id:
        return library[:3]
    matched = [
        preset for preset in library
        if checkpoint_id in (preset.get("checkpointIds") or [])
    ]
    if matched:
        return matched
    return []


def _select_lesson_excerpts(request: TutorChatRequest) -> list[dict[str, Any]]:
    """Return short lesson excerpts relevant to the active state and question."""
    library = _load_lesson_excerpts().get("excerpts", [])
    checkpoint_id = request.appState.activeCheckpointId
    cell_id = request.appState.activeCellId
    question_terms = {
        token.strip(".,:;!?()[]{}\"'").lower()
        for token in request.message.split()
        if len(token.strip(".,:;!?()[]{}\"'")) >= 4
    }

    scored: list[tuple[int, dict[str, Any]]] = []
    for excerpt in library:
        if not isinstance(excerpt, dict):
            continue
        score = 0
        if checkpoint_id and checkpoint_id in (excerpt.get("checkpointIds") or []):
            score += 4
        if cell_id and cell_id in (excerpt.get("cellIds") or []):
            score += 2
        keywords = {str(item).lower() for item in (excerpt.get("keywords") or [])}
        score += len(question_terms & keywords)
        if score > 0:
            scored.append((score, excerpt))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [excerpt for _, excerpt in scored[:4]]


def _summarize_state(state: TutorAppState) -> str:
    """Render a compact text snapshot of the live application state."""
    lines: list[str] = []
    lines.append(f"active_cell: {state.activeCellId or 'unknown'}")
    lines.append(f"active_checkpoint: {state.activeCheckpointId or 'unknown'}")
    if state.checkpointTitle:
        lines.append(f"checkpoint_title: {state.checkpointTitle}")
    if state.checkpointSubtitle:
        lines.append(f"checkpoint_goal: {state.checkpointSubtitle}")
    if state.visiblePage:
        lines.append("visible_page:")
        for key in (
            "kind",
            "title",
            "sectionId",
            "sectionTitle",
            "sectionIndex",
            "sectionCount",
            "subtitle",
            "introText",
            "bodyText",
        ):
            value = state.visiblePage.get(key)
            if value is not None and value != "":
                lines.append(f"  {key}: {value}")
    if state.activeBottomTab:
        lines.append(f"active_bottom_tab: {state.activeBottomTab}")
    if state.activeTask:
        task_title = state.activeTask.get("title") or state.activeTask.get("id")
        task_question = state.activeTask.get("question")
        task_status = state.activeTask.get("status")
        lines.append(f"active_task: {task_title} ({task_status or 'unknown'})")
        if task_question:
            lines.append(f"active_task_question: {task_question}")
    if state.checkpointRequirements:
        lines.append("checkpoint_requirements:")
        for requirement in state.checkpointRequirements[:6]:
            lines.append(f"  - {requirement}")
    lines.append(f"teacher_unlocked: {state.teacherUnlocked}")
    lines.append(f"fem_baseline_available: {state.femBaselineAvailable}")
    lines.append(f"comparison_available: {state.comparisonAvailable}")

    if state.controls:
        lines.append("controls:")
        for key, value in sorted(state.controls.items()):
            lines.append(f"  {key}: {value}")
    if state.controlOptions:
        lines.append("available_control_options:")
        for key, options in sorted(state.controlOptions.items()):
            if not options:
                continue
            option_text = ", ".join(
                f"{item.get('value')} ({item.get('label')})"
                for item in options[:8]
                if isinstance(item, dict)
            )
            lines.append(f"  {key}: {option_text}")
    if state.metricsSummary:
        lines.append("metrics_summary:")
        for key, value in state.metricsSummary.items():
            lines.append(f"  {key}: {value}")
    if state.taskProgress:
        active_task = state.taskProgress.get("activeTaskId")
        all_done = state.taskProgress.get("allComplete")
        lines.append(f"task_progress: active={active_task} all_complete={all_done}")
    if state.notes:
        lines.append("notes:")
        for note in state.notes[:6]:
            lines.append(f"  - {note}")
    return "\n".join(lines)


def _summarize_presets(presets: list[dict[str, Any]]) -> str:
    if not presets:
        return "(no curated presets matched the active checkpoint)"
    blocks: list[str] = []
    for preset in presets:
        controls_text = ", ".join(
            f"{k}={v}" for k, v in (preset.get("controls") or {}).items()
        )
        blocks.append(
            "\n".join(
                [
                    f"- id: {preset.get('id')}",
                    f"  title: {preset.get('title')}",
                    f"  intent: {preset.get('intent')}",
                    f"  suggested_controls: {{ {controls_text} }}",
                    f"  notes: {preset.get('notes', '')}",
                ]
            )
        )
    return "\n".join(blocks)


def _summarize_lessons(excerpts: list[dict[str, Any]]) -> str:
    if not excerpts:
        return "(no curated lesson excerpt matched this turn)"
    blocks: list[str] = []
    for excerpt in excerpts:
        blocks.append(
            "\n".join(
                [
                    f"- id: {excerpt.get('id')}",
                    f"  title: {excerpt.get('title')}",
                    f"  concept: {excerpt.get('summary', '')}",
                    f"  watch: {excerpt.get('watch', '')}",
                    f"  try: {excerpt.get('try', '')}",
                ]
            )
        )
    return "\n".join(blocks)


# ---------------------------------------------------------------------------
# Prompt assembly
# ---------------------------------------------------------------------------


_SYSTEM_PROMPT = """You are the PINN Playground tutor.

You teach a student who is working through an interactive Numerical-method
and PINN learning path. Your job is to explain physics, numerics, and
machine-learning trade-offs in a way that improves the student's reasoning,
not just their results.

Tone:
- Concise. Prefer short paragraphs and concrete references to the active
  controls or metrics.
- Pedagogical. Always say *why* a change helps, not only *what* to change.
- Honest. If the student has not produced the evidence required to answer
  (for example no completed training, no FEM comparison), say so and ask
  for the missing step.

Context discipline:
- Treat `visible_page` as the highest-priority context. If the student asks
    about "this page", "this chapter", "this tutorial", "these tutorial notes",
    or a similar deictic phrase, answer from `visible_page` first.
- When `visible_page.kind` is "tutorial", keep the answer inside the current
    tutorial section unless the student explicitly asks for another section or
    for the wider workspace. Do not pivot to old run notes, sampling counts,
    metrics, presets, or controls unless they are directly relevant to the
    visible tutorial text.
- Treat the `notes` field as low-priority workspace memory. Never interpret a
    workspace note as the tutorial note when a tutorial page is visible.

You operate in one of two modes:
- ask: explain only. Do not propose control changes.
- agent: you MAY propose at most one small set of structured control
  changes, but only if they are clearly justified by the live state.

Output contract:
You MUST reply with a single JSON object and nothing else. No prose before
or after, no markdown fences, and no <think> blocks. The object must match this shape:

{
  "message": "natural-language teaching reply",
  "suggestion": null OR {
    "rationale": "why these controls",
    "controls": { "controlKey": value, ... },
    "highlightKeys": ["controlKey", ...]
  },
  "citations": [
    { "type": "preset" | "lesson" | "checkpoint" | "state",
      "id": "...",
      "summary": "optional short note" }
  ],
  "warnings": ["optional advisory strings"]
}

Rules for `suggestion`:
- In ask mode, `suggestion` MUST be null.
- In agent mode, `suggestion` may be null if no change is justified.
- Only use control keys that appear in the live `controls` payload or in a
  cited preset. Do not invent new keys.
- For dropdown/select controls, use the exact option `value` listed in
    `available_control_options`. Do not use free-text labels or synonyms.
- Prefer small targeted changes. Do not rewrite the whole configuration.
- Always include a `rationale` tied to the active learning task.

Formatting rules for `message`:
- The `message` string may use Markdown for paragraphs, emphasis, and lists.
- When writing equations or variable symbols, use LaTeX delimiters: `$...$`
    for inline math and `$$...$$` for display math.
- Do not wrap the entire `message` in code fences.

Rules for `citations`:
- Cite the preset id when you base advice on a curated preset.
- Cite the lesson excerpt id when you use a curated teaching concept.
- Cite the active checkpoint id when you base advice on a learning task.
- Use type "state" when the advice is grounded only in the live app state.
"""


def _render_history(history: list[TutorChatMessage], keep_last: int = 6) -> str:
    if not history:
        return "(no prior turns)"
    tail = history[-keep_last:]
    rendered = []
    for turn in tail:
        rendered.append(f"{turn.role.upper()}: {turn.content.strip()}")
    return "\n".join(rendered)


def _build_messages(
    request: TutorChatRequest,
    presets: list[dict[str, Any]],
    lesson_excerpts: list[dict[str, Any]],
) -> list[dict[str, str]]:
    state_block = _summarize_state(request.appState)
    preset_block = _summarize_presets(presets)
    lesson_block = _summarize_lessons(lesson_excerpts)
    history_block = _render_history(request.history)

    think_directive = "/think" if request.thinkMode else "/no_think"
    user_block = (
        f"{think_directive}\nMODE: {request.mode}\nTHINK_MODE: {'on' if request.thinkMode else 'off'}\n\n"
        f"LIVE APP STATE:\n{state_block}\n\n"
        f"CURATED LESSON EXCERPTS (server-selected, you MAY cite by id):\n{lesson_block}\n\n"
        f"CURATED PRESETS (server-selected, you MAY cite by id):\n{preset_block}\n\n"
        f"RECENT CONVERSATION (older turns omitted):\n{history_block}\n\n"
        f"STUDENT QUESTION:\n{request.message.strip()}\n\n"
        "Reply with one JSON object as specified by the system message."
    )

    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_block},
    ]


# ---------------------------------------------------------------------------
# Local LLM client (OpenAI-compatible chat completions)
# ---------------------------------------------------------------------------


class TutorBackendError(RuntimeError):
    """Raised when the local LLM cannot satisfy the request."""


def _available_ollama_models() -> list[str]:
    """Return locally installed Ollama model names, if Ollama is reachable."""
    try:
        with urllib.request.urlopen(f"{_DEFAULT_OLLAMA_BASE}/api/tags", timeout=2) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return []
    models = payload.get("models") if isinstance(payload, dict) else None
    if not isinstance(models, list):
        return []
    names: list[str] = []
    for model in models:
        if isinstance(model, dict) and isinstance(model.get("name"), str):
            names.append(model["name"])
    return names


def _autodetect_qwen_model() -> str | None:
    available = set(_available_ollama_models())
    for candidate in _QWEN_MODEL_CANDIDATES:
        if candidate in available:
            return candidate
    return None


def _llm_endpoint() -> str:
    base = _env("TUTOR_API_BASE", _DEFAULT_OPENAI_BASE) or _DEFAULT_OPENAI_BASE
    base = base.rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return base + "/chat/completions"


def _llm_model() -> str:
    configured = _env("TUTOR_MODEL")
    if configured:
        return configured
    return _autodetect_qwen_model() or _QWEN_MODEL_CANDIDATES[0]


def _llm_timeout() -> float:
    try:
        return float(_env("TUTOR_TIMEOUT", "120") or "120")
    except ValueError:
        return 120.0


def _llm_call(messages: list[dict[str, str]]) -> str:
    """Synchronous OpenAI-compatible chat completion against a local server.

    Sync is intentional. This harness targets local single-user sessions on
    Ollama, vLLM, or llama.cpp server, where blocking the FastAPI worker for
    a model response is acceptable. If you later add concurrent users, wrap
    this in `asyncio.to_thread` from the endpoint.
    """
    endpoint = _llm_endpoint()
    model = _llm_model()

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "stream": False,
    }

    headers = {"Content-Type": "application/json"}
    api_key = _env("TUTOR_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=_llm_timeout()) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise TutorBackendError(
            f"Local LLM returned HTTP {exc.code} for model {model}: {detail}"
        ) from exc
    except urllib.error.URLError as exc:
        raise TutorBackendError(
            f"Failed to reach the local LLM at {endpoint}: {exc}. "
            "The default runner is Ollama; start it and pull one of "
            f"{', '.join(_QWEN_MODEL_CANDIDATES)}."
        ) from exc

    try:
        envelope = json.loads(raw)
        return envelope["choices"][0]["message"]["content"]
    except (json.JSONDecodeError, KeyError, IndexError) as exc:
        raise TutorBackendError(
            f"Unexpected response shape from local LLM: {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# Response validation
# ---------------------------------------------------------------------------


def _parse_model_json(raw_text: str) -> dict[str, Any] | None:
    """Tolerantly extract a single JSON object from the model output."""
    text = raw_text.strip()
    if not text:
        return None

    while "<think>" in text and "</think>" in text:
        before, rest = text.split("<think>", 1)
        _, after = rest.split("</think>", 1)
        text = (before + after).strip()

    # Strip common markdown fencing the model might add despite instructions.
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fall back to extracting the first {...} block.
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


def _normalize_option_token(value: Any) -> str:
    return "".join(ch for ch in str(value).lower() if ch.isalnum())


def _canonicalize_control_value(
    key: str,
    value: Any,
    control_options: dict[str, list[dict[str, str]]],
) -> tuple[bool, Any]:
    options = control_options.get(key) or []
    if not options:
        return True, value

    exact = str(value).strip()
    exact_values = {
        str(option.get("value")): str(option.get("value"))
        for option in options
        if isinstance(option, dict) and option.get("value") is not None
    }
    if exact in exact_values:
        return True, exact_values[exact]

    normalized = _normalize_option_token(value)
    alias = (_SELECT_VALUE_ALIASES.get(key) or {}).get(normalized)
    if alias and alias in exact_values:
        return True, alias

    for option in options:
        if not isinstance(option, dict):
            continue
        option_value = option.get("value")
        option_label = option.get("label", option_value)
        if option_value is None:
            continue
        if _normalize_option_token(option_value) == normalized:
            return True, str(option_value)
        if _normalize_option_token(option_label) == normalized:
            return True, str(option_value)

    return False, value


def _validate_response(
    raw_payload: dict[str, Any] | None,
    request: TutorChatRequest,
    presets: list[dict[str, Any]],
) -> TutorChatResponse:
    """Coerce a model dict into a TutorChatResponse, dropping unsafe parts.

    Safety policy:
    - In ask mode, any returned suggestion is discarded.
    - In agent mode, the suggestion is kept only if its `controls` keys all
      exist either in the live state or in a cited preset.
    """
    warnings: list[str] = []

    if not raw_payload or "message" not in raw_payload:
        return TutorChatResponse(
            message=(
                "The local model did not return a usable answer. Please "
                "rephrase the question or try again."
            ),
            mode=request.mode,
            warnings=["empty_or_invalid_model_output"],
        )

    message = str(raw_payload.get("message") or "").strip()
    if not message:
        message = "(the model returned an empty message)"

    citations_raw = raw_payload.get("citations") or []
    citations: list[TutorCitation] = []
    if isinstance(citations_raw, list):
        for entry in citations_raw:
            if not isinstance(entry, dict):
                continue
            citation_type = entry.get("type")
            if citation_type not in {"preset", "lesson", "checkpoint", "state"}:
                continue
            citations.append(
                TutorCitation(
                    type=citation_type,
                    id=str(entry.get("id", "")),
                    summary=(str(entry["summary"]) if entry.get("summary") else None),
                )
            )

    suggestion: TutorSuggestion | None = None
    suggestion_raw = raw_payload.get("suggestion")
    if request.mode == "agent" and isinstance(suggestion_raw, dict):
        controls_raw = suggestion_raw.get("controls") or {}
        if isinstance(controls_raw, dict) and controls_raw:
            allowed_keys = set(request.appState.controls.keys())
            for preset in presets:
                allowed_keys.update((preset.get("controls") or {}).keys())
            filtered: dict[str, Any] = {}
            invalid_select_values: list[str] = []
            for key, value in controls_raw.items():
                key_str = str(key)
                if key_str not in allowed_keys:
                    continue
                ok, canonical_value = _canonicalize_control_value(
                    key_str,
                    value,
                    request.appState.controlOptions,
                )
                if ok:
                    filtered[key_str] = canonical_value
                else:
                    invalid_select_values.append(key_str)
            dropped = sorted(set(controls_raw.keys()) - set(filtered.keys()))
            if dropped:
                warnings.append(
                    "dropped_unknown_control_keys:" + ",".join(map(str, dropped))
                )
            if invalid_select_values:
                warnings.append(
                    "dropped_invalid_select_values:" + ",".join(sorted(invalid_select_values))
                )
            if filtered:
                highlight_raw = suggestion_raw.get("highlightKeys") or list(filtered.keys())
                highlight = [str(k) for k in highlight_raw if str(k) in filtered]
                suggestion = TutorSuggestion(
                    rationale=str(suggestion_raw.get("rationale", "")).strip()
                    or "(no rationale provided)",
                    controls=filtered,
                    highlightKeys=highlight or list(filtered.keys()),
                )

    extra_warnings = raw_payload.get("warnings")
    if isinstance(extra_warnings, list):
        for warning in extra_warnings:
            warnings.append(str(warning))

    return TutorChatResponse(
        message=message,
        suggestion=suggestion,
        citations=citations,
        mode=request.mode,
        modelInfo={"model": _llm_model(), "endpoint": _llm_endpoint()},
        warnings=warnings,
    )


def get_tutor_status() -> dict[str, object]:
    """Return the current local-tutor runner configuration."""
    available = _available_ollama_models()
    model = _llm_model()
    return {
        "stub": _truthy_env("TUTOR_STUB"),
        "endpoint": _llm_endpoint(),
        "model": model,
        "qwenCandidates": list(_QWEN_MODEL_CANDIDATES),
        "availableOllamaModels": available,
        "ready": _truthy_env("TUTOR_STUB") or model in available or bool(_env("TUTOR_MODEL")),
    }


def clear_tutor_session(request: TutorClearRequest) -> dict[str, object]:
    """Clear server-held tutor memory for one global thread.

    The MVP still sends visible history from the frontend on every turn, but
    this hook keeps the API contract ready for server-side summaries and
    pending agent suggestions.
    """
    _SESSION_SUMMARIES.pop(request.sessionId, None)
    _PENDING_SUGGESTIONS.pop(request.sessionId, None)
    return {"cleared": True, "sessionId": request.sessionId}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def run_tutor_chat(request: TutorChatRequest) -> TutorChatResponse:
    """Run a single tutor turn through the harness."""
    presets = _select_presets(request.appState.activeCheckpointId)
    lesson_excerpts = _select_lesson_excerpts(request)

    if _truthy_env("TUTOR_STUB"):
        # Stub mode keeps the UI usable when the local LLM is intentionally disabled.
        sample_state = _summarize_state(request.appState).splitlines()
        peek = "\n".join(sample_state[:6])
        return TutorChatResponse(
            message=(
                "Tutor stub mode is enabled with TUTOR_STUB=1. The harness "
                f"loaded your live state successfully:\n\n{peek}"
            ),
            mode=request.mode,
            modelInfo={"model": "stub", "endpoint": "stub"},
            citations=[
                TutorCitation(
                    type="checkpoint",
                    id=str(request.appState.activeCheckpointId or "unknown"),
                    summary="Harness loaded checkpoint context for stub reply.",
                )
            ],
            warnings=["tutor_backend_not_configured"],
        )

    messages = _build_messages(request, presets, lesson_excerpts)

    try:
        raw_text = _llm_call(messages)
    except TutorBackendError as exc:
        return TutorChatResponse(
            message=f"Tutor backend error: {exc}",
            mode=request.mode,
            modelInfo={"model": _llm_model(), "endpoint": _llm_endpoint()},
            warnings=["tutor_backend_error"],
        )

    payload = _parse_model_json(raw_text)
    if payload is None:
        # One retry that asks the model to fix its output shape.
        retry_messages = messages + [
            {"role": "assistant", "content": raw_text},
            {
                "role": "user",
                "content": (
                    "Your previous reply did not parse as JSON. Reply now "
                    "with ONLY a single JSON object that matches the "
                    "specified schema, with no prose and no fences."
                ),
            },
        ]
        try:
            raw_text = _llm_call(retry_messages)
        except TutorBackendError as exc:
            return TutorChatResponse(
                message=f"Tutor backend error during retry: {exc}",
                mode=request.mode,
                modelInfo={"model": _llm_model(), "endpoint": _llm_endpoint()},
                warnings=["tutor_backend_error_on_retry"],
            )
        payload = _parse_model_json(raw_text)

    return _validate_response(payload, request, presets)

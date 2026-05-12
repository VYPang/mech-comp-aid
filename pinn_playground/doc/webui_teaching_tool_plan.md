# WebUI Teaching Tool Transformation Plan

## Context

Commit `1dfd2b91` completed the main checkpoint-based WebUI framework for `pinn_playground/`.

The current product is already useful as an experimentation surface:

- students can change parameters and observe numerical or PINN results
- the UI is organized as a staged learning path
- teacher-guided PINN support has already strengthened the educational framing

However, recent feedback exposed a real gap: a student can still treat the app as a parameter playground and reach a better result without understanding why that result is better.

The next phase should therefore shift the product from a "try knobs and see what happens" tool into a guided teaching system that combines:

1. concept-first tutorial modules with interactive figures
2. state-aware AI tutoring that reacts to the student's current settings and result quality

This plan defines that transition.

## Problem Statement

The current WebUI teaches mainly through experimentation, but not yet through structured explanation.

That creates four teaching risks:

- students can optimize by trial-and-error instead of reasoning
- hard-coded coach messages cannot adapt to the exact mistake the student is making
- the app explains workflow steps better than it explains computational concepts
- there is no strong loop of concept, experiment, reflection, and correction

## Product Goal

Turn the PINN Playground into an interactive teaching tool where each learning cell does three jobs:

1. explain the concept
2. let the student manipulate the concept visually
3. guide the student toward a better next action with context-aware feedback

## Design Principles

### 1. Teach before tuning

Each checkpoint should begin with a short concept module before exposing the full parameter surface.

### 2. Show cause and effect

Parameter changes should be tied to visible consequences, not just final scores.

### 3. Make guidance specific

Feedback should refer to the student's current geometry, sampling choices, optimizer settings, losses, and plots.

### 4. Keep the student active

The UI should not become a passive article reader. Every concept section should include at least one direct manipulation or micro-task.

### 5. Keep the system auditable

Any AI recommendation that changes controls must return structured output and remain visible to the student.

## Target User Experience

Each major learning topic should use the same four-part loop:

1. Learn
   The student reads a short tutorial card introducing one concept.
2. Manipulate
   The student uses an interactive figure to see how the concept changes the solution behavior.
3. Experiment
   The student applies that idea in the real numerical or PINN workspace.
4. Reflect
   The AI tutor explains why the current outcome is weak or strong and optionally proposes updated parameters.

This is the intended replacement for the current hard-coded Coach Panel.

## Scope Overview

The work should be split into two major product tracks.

## Track A - Tutorial Notes With Interactive Figures

### Objective

Add guided lesson content before the Numerical Cell and PINN Cell so students understand the idea they are about to test.

### Proposed lesson structure

For each cell, add a lesson rail with these sections:

1. `Concept`
   A concise explanation of the idea and why it matters.
2. `Interactive figure`
   A small visual toy that demonstrates the concept in isolation.
3. `What to watch`
   A short checklist describing which curves, errors, or stress regions the student should observe.
4. `Try this`
   A guided exercise with one or two concrete parameter changes.

### Numerical Cell lesson topics

Recommended initial modules:

1. ODE initial value problem intuition
2. Step size versus truncation error
3. Order of approximation versus cost
4. Stability versus accuracy
5. Mesh density and field resolution for the FEM side of the app

### PINN Cell lesson topics

Recommended initial modules:

1. Collocation points and what they represent
2. PDE loss versus boundary-condition loss
3. Why Neumann loading is harder than Dirichlet loading
4. Why teacher guidance helps the same benchmark
5. Sampling strategy, network capacity, and convergence behavior

### Interactive figure strategy

The Ciechanow-style reference is directionally correct: the lesson should feel visual, direct, and explorable.

Implementation note:

- use `three.js` when spatial manipulation or 3D scene understanding is genuinely useful
- use lighter 2D rendering for concepts that are fundamentally curve-based or field-based

For the first iteration, this likely means:

- numerical concept toys can be built with Plotly, Canvas, or SVG-style interactions
- geometry, load direction, mesh, or deformation illustrations can use `three.js` if rotation or depth adds teaching value

This keeps the teaching effect high without overengineering every figure as a 3D scene.

### Content architecture

Tutorial content should be data-driven rather than hard-coded into one large frontend file.

Suggested structure:

```text
pinn_playground/
  frontend/
    lessons/
      numerical/
      pinn/
```

Each lesson module should define:

- title
- learning objective
- explanation blocks
- interactive figure config
- guided tasks
- expected observations

## Track B - Interactive AI Tutorial

### Objective

Replace the current static coach behavior with an AI tutor that can explain poor outcomes and suggest better next settings based on the live app state.

### Core interaction

The student can ask questions such as:

- why is my result poor?
- why did this parameter change help?
- what should I change next?
- can you show me a more stable configuration?

The tutor should receive:

- the student's free-text question
- the active learning cell and checkpoint
- the current parameter state
- the latest numerical or PINN metrics
- lightweight summaries of current plots or result quality

The tutor should return:

1. an explanation in natural language
2. optional recommended control updates in structured JSON
3. optional teaching metadata such as confidence, rationale, and the concept being reinforced

### Proposed request contract

```json
{
  "cell": "pinn",
  "checkpoint": "pinn-teacher",
  "studentQuestion": "Why is the stress field still too smooth?",
  "controls": {
    "samplingMode": "uniform",
    "nCollocation": 1200,
    "teacher": {
      "enabled": true,
      "nInterior": 40,
      "nBoundary": 10,
      "nLoadPatch": 0,
      "weight": 5.0
    }
  },
  "observations": {
    "lossPde": 0.014,
    "lossBc": 0.087,
    "lossTeacher": 0.061,
    "stressPeakGapPercent": 23.4,
    "statusFlags": ["under-predicting_peak_stress"]
  }
}
```

### Proposed response contract

```json
{
  "message": "Your model is still under-constrained near the load patch. The PDE residual is improving, but the network still lacks direct displacement anchors where the traction enters the problem.",
  "recommendedUpdates": {
    "teacher": {
      "nLoadPatch": 12,
      "weight": 10.0
    }
  },
  "highlightKeys": [
    "teacher.nLoadPatch",
    "teacher.weight"
  ],
  "teachingFocus": "Neumann versus displacement supervision",
  "confidence": "high"
}
```

### UI behavior for recommended updates

When the student accepts the tutor recommendation:

1. matching controls are updated automatically
2. changed controls are highlighted in sharp pink
3. the tutor explains why those specific controls changed
4. the student can still reject or edit the suggestion before rerunning

### Safety and pedagogy rules

The tutor should not act like an opaque optimizer. It should always explain the reason for the change.

Required constraints:

- every control change must include a human-readable rationale
- the student must see the before-and-after values
- the tutor should prefer small changes over full control rewrites
- the tutor should tie advice to the learning objective of the active checkpoint

## Product Architecture Changes

### Frontend

Main expected changes:

1. Add a lesson panel or lesson mode ahead of each active workspace cell.
2. Replace the current Coach Panel with a Tutor Panel that supports chat plus suggested control updates.
3. Add a control-highlighting system for AI-suggested changes.
4. Add figure containers and per-lesson interactive components.
5. Preserve the current checkpoint shell, but let checkpoints include both lesson content and experiment tasks.

Likely frontend files to extend:

- `frontend/shell.js`
- `frontend/progress-state.js`
- `frontend/numerical-cell.js`
- `frontend/pinn-cell.js`
- `frontend/api.js`
- `frontend/style.css`

### Backend

Main expected changes:

1. Add an AI tutor endpoint that accepts a structured student-state payload.
2. Add server-side prompt assembly from checkpoint context, lesson objective, controls, and result summaries.
3. Add response validation so AI output is constrained to approved JSON schema.
4. Add lightweight summarizers for current numerical and PINN state so the model receives compact, meaningful context.

Likely backend additions:

- tutor request and response models
- a tutor service layer
- endpoint and provider configuration
- validation and logging for suggested updates

### Lesson content system

The lesson system should be treated as a first-class content layer, not embedded as scattered strings.

Recommended assets:

- markdown-like lesson text or structured JS objects
- figure configuration files
- guided exercise prompts
- learning-objective metadata for each checkpoint

## Delivery Plan

## Phase 0 - Product framing

Goal: freeze the teaching architecture before implementation spreads across the UI.

Deliverables:

1. approve the lesson-plus-tutor product model
2. decide whether lesson content is stored as markdown, JSON, or JS modules
3. decide whether the tutor uses one provider abstraction from day one or a single initial LLM backend

## Phase 1 - Replace static coaching with lesson scaffolding

Goal: introduce explicit teaching structure without yet depending on AI.

Deliverables:

1. lesson panel shell for Numerical and PINN cells
2. one full Numerical lesson module
3. one full PINN lesson module
4. checkpoint metadata updated to include concept, task, and reflection prompts

Success criterion:

The app teaches at least one complete concept flow without using any hard-coded coach Q&A.

## Phase 2 - Build interactive concept figures

Goal: make the tutorial itself manipulable.

Deliverables:

1. numerical ODE step-size toy
2. approximation-order toy
3. PINN loss-balance or collocation-distribution toy
4. reusable lesson figure container API

Success criterion:

The student can learn a concept in the lesson panel before touching the main experiment controls.

## Phase 3 - Add AI tutor backend and chat panel

Goal: make guidance adaptive to the student's current state.

Deliverables:

1. tutor API contract
2. tutor panel UI
3. state summarization pipeline
4. validated JSON response handling
5. explanation plus recommendation rendering

Success criterion:

The tutor can answer state-aware questions and return safe structured suggestions.

## Phase 4 - Add AI-driven control updates and visual highlighting

Goal: close the loop from explanation to action.

Deliverables:

1. apply-suggestion flow
2. pink-highlight change markers on updated controls
3. accept, reject, and reset suggestion states
4. event logging for which suggestions students accept

Success criterion:

Students can ask for help, inspect the reasoning, apply the suggested change, and clearly see what changed.

## Phase 5 - Evaluation and teaching validation

Goal: verify that the new system improves learning rather than only convenience.

Suggested evaluation signals:

1. students can explain why a recommendation helped
2. students complete guided tasks with fewer random retries
3. students ask concept questions, not only optimization questions
4. instructors report that the system supports teaching objectives better than the current Coach Panel

## MVP Recommendation

The first practical milestone should not try to ship both major ideas at once.

Recommended MVP order:

1. ship lesson scaffolding first
2. ship one strong interactive numerical lesson and one strong PINN lesson
3. then add the AI tutor on top of that structured lesson model

Reason:

If the lesson architecture is weak, the AI tutor will become a generic answer bot instead of a teaching component anchored to the learning path.

## Key Risks

### 1. AI becomes a shortcut machine

Risk:

Students may ask for the best parameters without understanding the reason.

Mitigation:

- require explanation alongside any suggestion
- tie advice to checkpoint learning goals
- optionally gate "apply suggestion" behind a brief rationale card

### 2. Three.js scope expands too quickly

Risk:

Interactive figures become expensive to build and maintain.

Mitigation:

- use `three.js` only where depth or geometry interaction matters
- keep 2D concept toys on lighter rendering paths

### 3. State payload to the AI becomes too large or noisy

Risk:

The tutor receives too much raw data and gives weak advice.

Mitigation:

- summarize metrics before sending them
- pass structured flags and compact diagnostics, not raw tensors or full plot arrays

### 4. UI becomes too crowded

Risk:

Lessons, experiments, and tutoring compete for the same space.

Mitigation:

- keep a clear separation between Learn, Experiment, and Tutor zones
- allow the lesson panel to collapse after the student finishes the concept step

## Open Decisions

These should be resolved before implementation starts:

1. Should lesson content live as markdown files, structured JSON, or frontend JS modules?
2. Which interactive figures truly need `three.js`, and which should stay 2D?
3. Should AI suggestions auto-apply only after user approval, or ever apply live?
4. Should the tutor remember prior student attempts within the same session?
5. What minimal analytics should be logged to measure teaching effectiveness?

## Definition of Done

This transformation should be considered successful when:

1. the Numerical and PINN cells both begin with explicit concept teaching
2. at least one interactive lesson exists in each cell
3. the static Coach Panel is removed or fully deprecated
4. the AI tutor can explain poor results using current app state
5. AI-proposed parameter changes are structured, reviewable, and visually highlighted
6. the student experience supports reasoning, not only parameter search

## Recommended Immediate Next Step

Start with a narrow implementation slice:

1. define the lesson content schema
2. build one Numerical lesson for step size and order of approximation
3. build one PINN lesson for Neumann loading versus teacher guidance
4. only after that, implement the tutor API contract against the same checkpoint metadata

That sequence keeps the architecture teachable and avoids coupling the product direction too early to the AI provider layer.
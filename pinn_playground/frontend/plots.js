const plotLayoutBase = {
  paper_bgcolor: "rgba(15, 23, 42, 0)",
  plot_bgcolor: "rgba(15, 23, 42, 0)",
  font: { color: "#cbd5e1" },
  margin: { l: 52, r: 24, t: 22, b: 44 },
};

export function initializeShellPlots(ids) {
  renderNotePlot(ids.left, "Waiting for a checkpoint", [
    "The active cell will draw into this panel.",
  ]);
  renderNotePlot(ids.right, "Waiting for a checkpoint", [
    "Result-oriented visuals appear here.",
  ]);
  renderNotePlot(ids.bottom, "Waiting for a checkpoint", [
    "Context, logs, or training history appear here.",
  ]);
}

export function renderPointCloudPlot(containerId, payload) {
  const traces = [];
  const shapes = [];

  traces.push(
    {
      x: payload.domain_points.x,
      y: payload.domain_points.y,
      type: "scattergl",
      mode: "markers",
      name: "Domain",
      marker: { size: 5, color: "#22d3ee", opacity: 0.75 },
    },
    {
      x: payload.boundary_points.x,
      y: payload.boundary_points.y,
      type: "scattergl",
      mode: "markers",
      name: "Boundary",
      marker: { size: 6, color: "#f59e0b", opacity: 0.95 },
    },
  );

  if (payload?.load?.edge === "top") {
    const xMin = payload.load.patch_center - 0.5 * payload.load.patch_width;
    const xMax = payload.load.patch_center + 0.5 * payload.load.patch_width;

    shapes.push({
      type: "line",
      xref: "x",
      yref: "y",
      x0: xMin,
      x1: xMax,
      y0: 1,
      y1: 1,
      line: { color: "#f97316", width: 5 },
      layer: "above",
    });

    traces.push({
      x: [xMin, xMax],
      y: [1, 1],
      type: "scatter",
      mode: "lines",
      name: "Top Load Patch",
      line: { color: "#f97316", width: 5 },
      hoverinfo: "skip",
      visible: "legendonly",
    });
  }

  Plotly.react(
    containerId,
    traces,
    {
      ...plotLayoutBase,
      shapes,
      xaxis: { title: "x", range: [-0.08, 1.08], gridcolor: "rgba(148, 163, 184, 0.15)" },
      yaxis: {
        title: "y",
        range: [-0.08, 1.08],
        scaleanchor: "x",
        scaleratio: 1,
        gridcolor: "rgba(148, 163, 184, 0.15)",
      },
      legend: { orientation: "h", y: 1.15 },
    },
    { responsive: true },
  );
}

export function renderStressHeatmap(containerId, grid) {
  Plotly.react(
    containerId,
    [
      {
        z: grid.z,
        x: grid.x,
        y: grid.y,
        type: "heatmap",
        colorscale: "Turbo",
        colorbar: { title: "Stress" },
      },
    ],
    {
      ...plotLayoutBase,
      xaxis: { title: "x", gridcolor: "rgba(148, 163, 184, 0.15)" },
      yaxis: {
        title: "y",
        scaleanchor: "x",
        scaleratio: 1,
        gridcolor: "rgba(148, 163, 184, 0.15)",
      },
    },
    { responsive: true },
  );
}

export function renderLossPlot(containerId, losses) {
  Plotly.react(
    containerId,
    [
      {
        x: losses.epoch,
        y: losses.total,
        mode: "lines+markers",
        name: "Total Loss",
        line: { color: "#22d3ee" },
      },
      {
        x: losses.epoch,
        y: losses.pde,
        mode: "lines+markers",
        name: "Physics Loss",
        line: { color: "#818cf8" },
      },
      {
        x: losses.epoch,
        y: losses.bc,
        mode: "lines+markers",
        name: "BC Loss",
        line: { color: "#f97316" },
      },
    ],
    {
      ...plotLayoutBase,
      xaxis: { title: "Epoch", gridcolor: "rgba(148, 163, 184, 0.15)" },
      yaxis: { title: "Loss", gridcolor: "rgba(148, 163, 184, 0.15)" },
      legend: { orientation: "h", y: 1.15 },
    },
    { responsive: true },
  );
}

export function renderFemMeshPlot(containerId, payload) {
  const meshSegments = triangleSegments(payload.mesh);

  Plotly.react(
    containerId,
    [
      {
        x: meshSegments.x,
        y: meshSegments.y,
        type: "scattergl",
        mode: "lines",
        name: "Mesh",
        line: { color: "#334155", width: 1 },
      },
      {
        x: payload.boundaries.internal.x,
        y: payload.boundaries.internal.y,
        type: "scattergl",
        mode: "lines",
        name: "Internal Boundary",
        line: { color: "#94a3b8", width: 2 },
      },
      {
        x: payload.boundaries.bottom_support.x,
        y: payload.boundaries.bottom_support.y,
        type: "scattergl",
        mode: "lines",
        name: "Bottom Support",
        line: { color: "#22d3ee", width: 4 },
      },
      {
        x: payload.boundaries.top_load.x,
        y: payload.boundaries.top_load.y,
        type: "scattergl",
        mode: "lines",
        name: "Top Load Patch",
        line: { color: "#f97316", width: 5 },
      },
    ],
    {
      ...plotLayoutBase,
      xaxis: { title: "x", range: [0, 1], gridcolor: "rgba(148, 163, 184, 0.15)" },
      yaxis: {
        title: "y",
        range: [0, 1],
        scaleanchor: "x",
        scaleratio: 1,
        gridcolor: "rgba(148, 163, 184, 0.15)",
      },
      legend: { orientation: "h", y: 1.15 },
    },
    { responsive: true },
  );
}

export function renderFemBoundaryPlot(containerId, payload) {
  Plotly.react(
    containerId,
    [
      {
        x: payload.boundaries.outer_left.x,
        y: payload.boundaries.outer_left.y,
        type: "scattergl",
        mode: "lines",
        name: "Left Edge",
        line: { color: "#64748b", width: 3 },
      },
      {
        x: payload.boundaries.outer_right.x,
        y: payload.boundaries.outer_right.y,
        type: "scattergl",
        mode: "lines",
        name: "Right Edge",
        line: { color: "#64748b", width: 3 },
      },
      {
        x: payload.boundaries.top_free.x,
        y: payload.boundaries.top_free.y,
        type: "scattergl",
        mode: "lines",
        name: "Top Free Edge",
        line: { color: "#a855f7", width: 3 },
      },
      {
        x: payload.boundaries.bottom_support.x,
        y: payload.boundaries.bottom_support.y,
        type: "scattergl",
        mode: "lines",
        name: "Bottom Support",
        line: { color: "#22d3ee", width: 4 },
      },
      {
        x: payload.boundaries.top_load.x,
        y: payload.boundaries.top_load.y,
        type: "scattergl",
        mode: "lines",
        name: "Top Load Patch",
        line: { color: "#f97316", width: 5 },
      },
      {
        x: payload.boundaries.internal.x,
        y: payload.boundaries.internal.y,
        type: "scattergl",
        mode: "lines",
        name: "Hole / Brace Boundary",
        line: { color: "#cbd5e1", width: 2 },
      },
    ],
    {
      ...plotLayoutBase,
      xaxis: { title: "x", range: [0, 1], gridcolor: "rgba(148, 163, 184, 0.15)" },
      yaxis: {
        title: "y",
        range: [0, 1],
        scaleanchor: "x",
        scaleratio: 1,
        gridcolor: "rgba(148, 163, 184, 0.15)",
      },
      legend: { orientation: "h", y: 1.18 },
    },
    { responsive: true },
  );
}

export function renderFemDeformedPlot(containerId, payload) {
  const undeformed = triangleSegments({
    points: payload.deformed_mesh.points,
    triangles: payload.deformed_mesh.triangles,
  });
  const deformed = triangleSegments({
    points: payload.deformed_mesh.deformed_points,
    triangles: payload.deformed_mesh.triangles,
  });

  Plotly.react(
    containerId,
    [
      {
        x: undeformed.x,
        y: undeformed.y,
        type: "scattergl",
        mode: "lines",
        name: "Undeformed",
        line: { color: "#334155", width: 1 },
      },
      {
        x: deformed.x,
        y: deformed.y,
        type: "scattergl",
        mode: "lines",
        name: "Deformed (scaled)",
        line: { color: "#22d3ee", width: 2 },
      },
    ],
    {
      ...plotLayoutBase,
      xaxis: { title: "x", gridcolor: "rgba(148, 163, 184, 0.15)" },
      yaxis: {
        title: "y",
        scaleanchor: "x",
        scaleratio: 1,
        gridcolor: "rgba(148, 163, 184, 0.15)",
      },
      legend: { orientation: "h", y: 1.15 },
    },
    { responsive: true },
  );
}

export function renderNotePlot(containerId, title, lines) {
  const annotations = [
    {
      x: 0.5,
      y: 0.78,
      xref: "paper",
      yref: "paper",
      showarrow: false,
      align: "center",
      font: { size: 18, color: "#f8fafc" },
      text: title,
    },
    {
      x: 0.5,
      y: 0.42,
      xref: "paper",
      yref: "paper",
      showarrow: false,
      align: "left",
      font: { size: 13, color: "#cbd5e1" },
      text: lines.map((line) => `• ${line}`).join("<br>"),
    },
  ];

  Plotly.react(
    containerId,
    [],
    {
      ...plotLayoutBase,
      xaxis: { visible: false },
      yaxis: { visible: false },
      annotations,
    },
    { responsive: true },
  );
}

function triangleSegments(mesh) {
  const edgeKeys = new Set();
  const x = [];
  const y = [];

  for (let idx = 0; idx < mesh.triangles.i.length; idx += 1) {
    const tri = [mesh.triangles.i[idx], mesh.triangles.j[idx], mesh.triangles.k[idx]];
    for (const [a, b] of [
      [tri[0], tri[1]],
      [tri[1], tri[2]],
      [tri[2], tri[0]],
    ]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (edgeKeys.has(key)) {
        continue;
      }
      edgeKeys.add(key);
      x.push(mesh.points.x[a], mesh.points.x[b], null);
      y.push(mesh.points.y[a], mesh.points.y[b], null);
    }
  }

  return { x, y };
}

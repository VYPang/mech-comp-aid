const plotLayoutBase = {
  paper_bgcolor: "rgba(15, 23, 42, 0)",
  plot_bgcolor: "rgba(15, 23, 42, 0)",
  font: { color: "#cbd5e1" },
  margin: { l: 52, r: 24, t: 22, b: 44 },
};

const loadPatchColor = "#22c55e";
const teacherColor = "#f472b6";

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
  traces.push({
    x: payload.domain_points.x,
    y: payload.domain_points.y,
    type: "scatter",
    mode: "markers",
    name: "Domain",
    marker: { size: 5, color: "#22d3ee", opacity: 0.75 },
  });

  traces.push({
    x: payload.boundary_points.x,
    y: payload.boundary_points.y,
    type: "scatter",
    mode: "markers",
    name: "Boundary",
    marker: { size: 6, color: "#f59e0b", opacity: 0.95 },
  });

  if (payload?.load?.edge === "top") {
    const xMin = payload.load.patch_center - 0.5 * payload.load.patch_width;
    const xMax = payload.load.patch_center + 0.5 * payload.load.patch_width;

    traces.push({
      x: [xMin, xMax],
      y: [1, 1],
      type: "scatter",
      mode: "lines",
      name: "Top Load Patch",
      line: { color: loadPatchColor, width: 5 },
      hoverinfo: "skip",
    });
  }

  const teacher = payload?.teacher_points;
  if (teacher) {
    const addTeacherGroup = (group, label) => {
      const xs = group?.x ?? [];
      const ys = group?.y ?? [];
      if (!xs.length) return;
      traces.push({
        x: xs,
        y: ys,
        type: "scatter",
        mode: "markers",
        name: label,
        marker: {
          size: 4,
          color: teacherColor,
          opacity: 1.0,
          line: { width: 0.5, color: "#1e293b" },
        },
      });
    };
    addTeacherGroup(teacher.interior, "Teacher (interior)");
    addTeacherGroup(teacher.boundary, "Teacher (boundary)");
    addTeacherGroup(teacher.load_patch, "Teacher (load patch)");
  }

  Plotly.react(
    containerId,
    traces,
    {
      ...plotLayoutBase,
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

export function renderStressHeatmap(containerId, grid, colorRange = null) {
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
        zmin: colorRange?.min,
        zmax: colorRange?.max,
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

export function renderErrorHeatmap(containerId, grid, colorRange = null) {
  Plotly.react(
    containerId,
    [
      {
        z: grid.z,
        x: grid.x,
        y: grid.y,
        type: "heatmap",
        colorscale: "Reds",
        colorbar: { title: "Abs. Error" },
        zmin: colorRange?.min,
        zmax: colorRange?.max,
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

export function buildDisplacementErrorGrid(referenceGrid, candidateGrid) {
  const referenceX = referenceGrid?.x;
  const referenceY = referenceGrid?.y;
  const referenceU = referenceGrid?.u;
  const referenceV = referenceGrid?.v;
  const candidateU = candidateGrid?.u;
  const candidateV = candidateGrid?.v;

  if (
    !Array.isArray(referenceX)
    || !Array.isArray(referenceY)
    || !Array.isArray(referenceU)
    || !Array.isArray(referenceV)
    || !Array.isArray(candidateU)
    || !Array.isArray(candidateV)
    || referenceU.length !== candidateU.length
    || referenceV.length !== candidateV.length
  ) {
    return null;
  }

  const z = referenceU.map((uRow, rowIndex) => {
    const vRow = referenceV[rowIndex];
    const candidateURow = candidateU[rowIndex];
    const candidateVRow = candidateV[rowIndex];
    if (
      !Array.isArray(uRow)
      || !Array.isArray(vRow)
      || !Array.isArray(candidateURow)
      || !Array.isArray(candidateVRow)
      || uRow.length !== candidateURow.length
      || vRow.length !== candidateVRow.length
    ) {
      return null;
    }

    return uRow.map((uValue, colIndex) => {
      const vValue = vRow[colIndex];
      const candidateUValue = candidateURow[colIndex];
      const candidateVValue = candidateVRow[colIndex];
      if (
        !Number.isFinite(uValue)
        || !Number.isFinite(vValue)
        || !Number.isFinite(candidateUValue)
        || !Number.isFinite(candidateVValue)
      ) {
        return null;
      }
      const du = candidateUValue - uValue;
      const dv = candidateVValue - vValue;
      return Math.sqrt(du * du + dv * dv);
    });
  });

  if (z.some((row) => row === null)) {
    return null;
  }

  return {
    x: referenceX,
    y: referenceY,
    z,
  };
}

export function renderDisplacementErrorHeatmap(containerId, referenceGrid, candidateGrid) {
  const errorGrid = buildDisplacementErrorGrid(referenceGrid, candidateGrid);
  if (!errorGrid) {
    renderNotePlot(containerId, "Absolute Displacement Error", [
      "Displacement error needs matching FEM and PINN grids.",
    ]);
    return;
  }

  Plotly.react(
    containerId,
    [
      {
        z: errorGrid.z,
        x: errorGrid.x,
        y: errorGrid.y,
        type: "heatmap",
        colorscale: "Reds",
        colorbar: { title: "Abs. Disp. Error" },
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

export function renderDeformationGridPlot(containerId, grid) {
  const visualScale = Number.isFinite(grid?.scale) && grid.scale > 0 ? grid.scale : 1;
  const segments = displacementGridSegments(grid, visualScale);
  const traces = [
    {
      z: grid.magnitude,
      x: grid.x,
      y: grid.y,
      type: "heatmap",
      colorscale: "Blues",
      showscale: true,
      colorbar: { title: "|u|" },
      opacity: 0.42,
      hoverinfo: "skip",
    },
    {
      x: segments.base.x,
      y: segments.base.y,
      type: "scattergl",
      mode: "lines",
      name: "Undeformed grid",
      line: { color: "#334155", width: 1 },
    },
    {
      x: segments.deformed.x,
      y: segments.deformed.y,
      type: "scattergl",
      mode: "lines",
      name: visualScale === 1 ? "Deformed" : "Deformed (scaled)",
      line: { color: "#22d3ee", width: 2 },
    },
  ];

  Plotly.react(
    containerId,
    traces,
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

export function renderLossPlot(containerId, losses) {
  const traces = [
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
  ];
  if (Array.isArray(losses.teacher) && losses.teacher.some((v) => Number.isFinite(v))) {
    traces.push({
      x: losses.epoch,
      y: losses.teacher,
      mode: "lines+markers",
      name: "Teacher Loss",
      line: { color: teacherColor },
    });
  }
  Plotly.react(
    containerId,
    traces,
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
        line: { color: loadPatchColor, width: 5 },
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
        line: { color: loadPatchColor, width: 5 },
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
  const visualScale = Number.isFinite(payload?.deformed_mesh?.scale) && payload.deformed_mesh.scale > 0
    ? payload.deformed_mesh.scale
    : 1;
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
        name: visualScale === 1 ? "Deformed" : "Deformed (scaled)",
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

function displacementGridSegments(grid, scale) {
  const base = { x: [], y: [] };
  const deformed = { x: [], y: [] };
  const xs = grid?.x ?? [];
  const ys = grid?.y ?? [];
  const uRows = grid?.u ?? [];
  const vRows = grid?.v ?? [];
  const rowCount = ys.length;
  const colCount = xs.length;

  const finiteNode = (row, col) => (
    Number.isFinite(xs[col])
    && Number.isFinite(ys[row])
    && Number.isFinite(uRows[row]?.[col])
    && Number.isFinite(vRows[row]?.[col])
  );
  const pushSegment = (r1, c1, r2, c2) => {
    if (!finiteNode(r1, c1) || !finiteNode(r2, c2)) {
      return;
    }
    const x1 = xs[c1];
    const y1 = ys[r1];
    const x2 = xs[c2];
    const y2 = ys[r2];
    base.x.push(x1, x2, null);
    base.y.push(y1, y2, null);
    deformed.x.push(x1 + scale * uRows[r1][c1], x2 + scale * uRows[r2][c2], null);
    deformed.y.push(y1 + scale * vRows[r1][c1], y2 + scale * vRows[r2][c2], null);
  };

  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      if (col + 1 < colCount) {
        pushSegment(row, col, row, col + 1);
      }
      if (row + 1 < rowCount) {
        pushSegment(row, col, row + 1, col);
      }
    }
  }

  return { base, deformed };
}

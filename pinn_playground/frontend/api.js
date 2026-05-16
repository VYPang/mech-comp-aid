function makeUrl(path) {
  return new URL(path, window.location.origin).toString();
}

async function getJson(path) {
  const response = await fetch(makeUrl(path));

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

async function postJson(path, payload) {
  const response = await fetch(makeUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

export function fetchFemPreview(config) {
  return postJson("/api/fem/preview", config);
}

export function fetchFemSolve(config) {
  return postJson("/api/fem/solve", config);
}

export function fetchPinnPreview(config) {
  return postJson("/api/preview-points", config);
}

export function fetchTeacherPreview(config) {
  return postJson("/api/teacher-preview", config);
}

export function fetchWebuiDiagnostics(request) {
  return postJson("/api/diagnostics", request);
}

export function postTutorChat(request) {
  return postJson("/api/tutor/chat", request);
}

export function clearTutorChat(request) {
  return postJson("/api/tutor/clear", request);
}

export function fetchTutorStatus() {
  return getJson("/api/tutor/status");
}

export function createPinnSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${protocol}//${window.location.host}/ws/train`);
}

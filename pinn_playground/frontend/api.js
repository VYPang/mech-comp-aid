function makeUrl(path) {
  return new URL(path, window.location.origin).toString();
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

export function createPinnSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${protocol}//${window.location.host}/ws/train`);
}

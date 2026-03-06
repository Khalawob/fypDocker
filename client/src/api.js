const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export function getToken() {
  return localStorage.getItem("token");
}

export async function apiRequest(path, { method = "GET", body, token } = {}) {
  const jwt = token ?? getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Request failed");
  }
  return data;
}
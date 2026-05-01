export async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message = data?.detail || data?.message || `Request failed: ${res.status}`;
    throw new Error(message);
  }

  return data;
}

export function postJson(url, body) {
  return jsonFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

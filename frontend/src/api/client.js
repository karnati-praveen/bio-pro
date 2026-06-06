// Fetch wrapper for the Biological Compiler backend.
//
// In dev (Vite proxy) VITE_API_BASE_URL is unset → BASE_URL = "" → relative paths
// hit the Vite proxy unchanged.  In the Tauri production build the env var is set
// to http://127.0.0.1:8000 so every request goes directly to the bundled backend.

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function handle(res) {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch (_) { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

// ---- Parts ---------------------------------------------------------------- //
export async function fetchParts(host = null, type = null) {
  const params = new URLSearchParams();
  if (host) params.set("host", host);
  if (type) params.set("type", type);
  const qs = params.toString() ? `?${params}` : "";
  return handle(await fetch(`${BASE_URL}/api/parts${qs}`));
}

export async function fetchPart(partId) {
  return handle(await fetch(`${BASE_URL}/api/parts/${encodeURIComponent(partId)}`));
}

// ---- Compile -------------------------------------------------------------- //
export async function compile(payload) {
  return handle(
    await fetch(`${BASE_URL}/api/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

// ---- Parameter sweep ------------------------------------------------------ //
export async function parameterSweep(compileResult, parameter, minVal, maxVal, steps = 10) {
  return handle(
    await fetch(`${BASE_URL}/api/simulate/sweep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compile_result: compileResult,
        parameter,
        min_val: minVal,
        max_val: maxVal,
        steps,
      }),
    })
  );
}

// ---- Stochastic simulation ------------------------------------------------ //
export async function stochasticSimulate(compileResult, nTrajectories = 50, threshold = null) {
  return handle(
    await fetch(`${BASE_URL}/api/simulate/stochastic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compile_result: compileResult,
        n_trajectories: nTrajectories,
        threshold,
      }),
    })
  );
}

// ---- Assembly / cloning --------------------------------------------------- //
export async function generateAssembly(compileResult, method = "gibson") {
  return handle(
    await fetch(`${BASE_URL}/api/assembly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compile_result: compileResult, method }),
    })
  );
}

export async function downloadAssemblyPdf(compileResult, method = "gibson") {
  const res = await fetch(`${BASE_URL}/api/assembly/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ compile_result: compileResult, method }),
  });
  if (!res.ok) throw new Error(`PDF failed (${res.status})`);
  const blob = await res.blob();
  const ext = res.headers.get("content-type")?.includes("pdf") ? "pdf" : "txt";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assembly_protocol_${method}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- DNA ordering --------------------------------------------------------- //
export async function generateOrder(compileResult) {
  return handle(
    await fetch(`${BASE_URL}/api/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(compileResult),
    })
  );
}

// ---- Designs: save / load / version --------------------------------------- //
export async function listDesigns() {
  return handle(await fetch(`${BASE_URL}/api/designs`));
}

export async function saveDesign(name, request, response) {
  return handle(
    await fetch(`${BASE_URL}/api/designs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, request, response }),
    })
  );
}

export async function addVersion(designId, request, response) {
  return handle(
    await fetch(`${BASE_URL}/api/designs/${designId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request, response }),
    })
  );
}

export async function getDesign(designId) {
  return handle(await fetch(`${BASE_URL}/api/designs/${designId}`));
}

export async function loadVersion(designId, versionNo) {
  return handle(await fetch(`${BASE_URL}/api/designs/${designId}/versions/${versionNo}`));
}

export function exportVersionUrl(designId, versionNo, format) {
  return `${BASE_URL}/api/designs/${designId}/versions/${versionNo}/export?format=${format}`;
}

export async function exportInline(response, format) {
  const res = await fetch(`${BASE_URL}/api/export?format=${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(response),
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="(.+?)"/);
  const filename = match ? match[1] : `design.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

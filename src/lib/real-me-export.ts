import { REAL_ME_QUESTIONNAIRE, type Answers } from "./real-me-questionnaire-schema";

export type ExportPayload = {
  label: string;
  answers: Answers;
  seed?: unknown;
  completion?: number;
  versionNumber?: number;
  createdAt?: string;
};

function safeFileName(s: string) {
  return s.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "real-me";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportRealMeJson(payload: ExportPayload) {
  const out = {
    schema: "twinly.real_me.export/v1",
    exportedAt: new Date().toISOString(),
    label: payload.label,
    versionNumber: payload.versionNumber ?? null,
    createdAt: payload.createdAt ?? null,
    completionPercentage: payload.completion ?? null,
    seed: payload.seed ?? null,
    answers: payload.answers,
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  triggerDownload(blob, `real-me_${safeFileName(payload.label)}.json`);
}

/** Uses the browser print dialog to produce a PDF (Save as PDF). Works without extra deps. */
export function exportRealMePdf(payload: ExportPayload) {
  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) {
    throw new Error("Popup blocked — allow popups to export as PDF.");
  }
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "<em style='color:#999'>—</em>";
    if (Array.isArray(v)) return v.map((x) => esc(String(x))).join(", ");
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return esc(String(v));
  };
  const sections = REAL_ME_QUESTIONNAIRE.map((s) => {
    const rows = s.questions
      .map(
        (q) =>
          `<tr><td style="padding:6px 10px;vertical-align:top;color:#555;width:45%">${esc(q.promptText)}</td><td style="padding:6px 10px;vertical-align:top">${fmt(payload.answers[q.id])}</td></tr>`,
      )
      .join("");
    return `<h2 style="margin:22px 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#111">${esc(s.title)}</h2><table style="width:100%;border-collapse:collapse;font-size:12px;border-top:1px solid #ddd">${rows}</table>`;
  }).join("");
  const seedBlock = payload.seed
    ? `<pre style="background:#f5f5f5;padding:10px;border-radius:6px;font-size:11px;white-space:pre-wrap">${esc(JSON.stringify(payload.seed, null, 2))}</pre>`
    : "";
  win.document.write(`<!doctype html><html><head><title>${esc(payload.label)}</title><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;padding:32px;max-width:820px;margin:0 auto"><h1 style="font-size:20px;margin:0 0 4px">${esc(payload.label)}</h1><div style="font-size:12px;color:#666;margin-bottom:16px">${payload.versionNumber ? `Version ${payload.versionNumber} · ` : ""}${payload.completion != null ? `${payload.completion}% complete · ` : ""}${payload.createdAt ? new Date(payload.createdAt).toLocaleString() : ""}</div>${seedBlock}${sections}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  win.document.close();
}

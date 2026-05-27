"use client";

import { useState, useRef } from "react";
import { Modal, Button } from "@/shared/components";

/**
 * Decode JWT payload (browser-safe, no signature check).
 */
function decodeJwt(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

/**
 * Map a sub2api record (platform: "openai", credentials: {...}, extra: {...}) to backend payload.
 */
function mapSub2ApiItem(src, fileName) {
  const cred = src.credentials || {};
  const accessToken = cred.access_token || src.access_token;
  if (!accessToken) {
    return { ok: false, error: "Missing access_token" };
  }

  const jwt = decodeJwt(accessToken) || {};
  const auth = jwt["https://api.openai.com/auth"] || {};
  const profile = jwt["https://api.openai.com/profile"] || {};

  const email =
    src.extra?.email ||
    profile.email ||
    (typeof src.name === "string" && src.name.includes("@") ? src.name : null);

  const chatgptAccountId =
    cred.chatgpt_account_id ||
    auth.chatgpt_account_id ||
    src.organization_id ||
    null;

  const chatgptPlanType = auth.chatgpt_plan_type || null;

  let expiresAt = null;
  if (cred.expires_at) {
    const sec = Number(cred.expires_at);
    if (Number.isFinite(sec) && sec > 0) {
      expiresAt = new Date(sec * 1000).toISOString();
    }
  }

  const providerSpecificData = {};
  if (chatgptAccountId) providerSpecificData.chatgptAccountId = chatgptAccountId;
  if (chatgptPlanType) providerSpecificData.chatgptPlanType = chatgptPlanType;

  return {
    ok: true,
    payload: {
      name: typeof src.name === "string" ? src.name : null,
      email,
      accessToken,
      refreshToken: cred.refresh_token || null,
      expiresAt,
      expiresIn: typeof cred.expires_in === "number" ? cred.expires_in : undefined,
      priority: typeof src.priority === "number" ? src.priority : undefined,
      providerSpecificData,
      _source: fileName,
    },
  };
}

/**
 * Map a codex-cli token.json record (type: "codex", flat top-level fields) to backend payload.
 */
function mapCodexCliItem(src, fileName) {
  const accessToken = src.access_token;
  if (!accessToken) {
    return { ok: false, error: "Missing access_token" };
  }

  const jwt = decodeJwt(accessToken) || {};
  const auth = jwt["https://api.openai.com/auth"] || {};
  const profile = jwt["https://api.openai.com/profile"] || {};

  const email = src.email || profile.email || null;
  const chatgptAccountId = src.account_id || auth.chatgpt_account_id || null;
  const chatgptPlanType = src.plan_type || auth.chatgpt_plan_type || null;

  let expiresAt = null;
  if (src.expired) {
    const d = new Date(src.expired);
    if (!Number.isNaN(d.getTime())) {
      expiresAt = d.toISOString();
    }
  }

  const providerSpecificData = {};
  if (chatgptAccountId) providerSpecificData.chatgptAccountId = chatgptAccountId;
  if (chatgptPlanType) providerSpecificData.chatgptPlanType = chatgptPlanType;

  return {
    ok: true,
    payload: {
      name: typeof src.name === "string" ? src.name : null,
      email,
      accessToken,
      refreshToken: src.refresh_token || null,
      expiresAt,
      providerSpecificData,
      _source: fileName,
    },
  };
}

/**
 * Map a single source record to backend payload. Supports two formats:
 *  1. sub2api: { platform: "openai", credentials: {...}, extra: {...} }
 *  2. codex-cli token.json: { type: "codex", access_token, refresh_token, email, account_id, plan_type, expired, ... }
 * Returns { ok: true, payload } or { ok: false, error }.
 */
function mapItem(src, fileName) {
  if (!src || typeof src !== "object") {
    return { ok: false, error: "Not an object" };
  }

  if (src.type === "codex" || (!src.credentials && !src.platform && src.access_token)) {
    return mapCodexCliItem(src, fileName);
  }

  if (src.platform && src.platform !== "openai") {
    return { ok: false, error: `Unsupported platform: ${src.platform}` };
  }

  return mapSub2ApiItem(src, fileName);
}

export default function CodexImportCredentialsModal({ isOpen, onClose, onImported }) {
  const [parsed, setParsed] = useState([]); // [{ payload, _source }]
  const [parseErrors, setParseErrors] = useState([]); // [{ file, error }]
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const reset = () => {
    setParsed([]);
    setParseErrors([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const handleFiles = async (fileList) => {
    setResult(null);
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const allParsed = [];
    const errors = [];

    for (const file of files) {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const records = Array.isArray(json) ? json : [json];
        records.forEach((rec, idx) => {
          const label = `${file.name}${records.length > 1 ? `[${idx}]` : ""}`;
          const r = mapItem(rec, label);
          if (r.ok) {
            allParsed.push(r.payload);
          } else {
            errors.push({ file: label, error: r.error });
          }
        });
      } catch (err) {
        errors.push({ file: file.name, error: `Invalid JSON: ${err.message}` });
      }
    }

    setParsed(allParsed);
    setParseErrors(errors);
  };

  const handleImport = async () => {
    if (parsed.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const items = parsed.map((p) => {
        const { _source, ...rest } = p;
        return rest;
      });
      const res = await fetch("/api/oauth/codex/import-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: "error", text: data.error || "Import failed" });
      } else {
        setResult({
          type: "success",
          text: `Imported ${data.imported}/${data.total}`,
          errors: data.errors || [],
        });
        if (data.imported > 0 && onImported) onImported(data);
      }
    } catch (err) {
      setResult({ type: "error", text: err.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import ChatGPT Credentials"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={importing}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            loading={importing}
            disabled={parsed.length === 0 || importing}
          >
            <span className="material-symbols-outlined text-[14px] mr-1">cloud_upload</span>
            Import {parsed.length > 0 ? `(${parsed.length})` : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          Pick one or more JSON files. Each file may be a single object or an array. Supports sub2api format (platform: openai) and codex-cli token.json format (type: codex).
        </p>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            id="codex-import-files"
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <span className="material-symbols-outlined text-[14px] mr-1">folder_open</span>
            Select JSON files
          </Button>
          {(parsed.length > 0 || parseErrors.length > 0) && (
            <Button variant="ghost" size="sm" onClick={reset} disabled={importing}>
              Clear
            </Button>
          )}
        </div>

        {parsed.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-surface-2 text-xs font-medium border-b border-border">
              <span>Records ready to import:</span> {parsed.length}
            </div>
            <div className="max-h-64 overflow-y-auto custom-scrollbar divide-y divide-border">
              {parsed.map((p, i) => (
                <div key={i} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {p.email || p.name || "(unnamed)"}
                    </div>
                    <div className="text-text-muted truncate">
                      {p._source}
                      {p.providerSpecificData?.chatgptPlanType
                        ? ` · ${p.providerSpecificData.chatgptPlanType}`
                        : ""}
                      {p.refreshToken ? " · refresh_token" : " · access_token only"}
                    </div>
                  </div>
                  <button
                    onClick={() => setParsed(parsed.filter((_, idx) => idx !== i))}
                    className="text-text-muted hover:text-red-500 p-1 rounded"
                    title="Remove"
                    disabled={importing}
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {parseErrors.length > 0 && (
          <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-lg overflow-hidden">
            <div className="px-3 py-2 text-xs font-medium border-b border-yellow-500/20 text-yellow-700 dark:text-yellow-400">
              <span>Skipped:</span> {parseErrors.length}
            </div>
            <div className="max-h-32 overflow-y-auto custom-scrollbar">
              {parseErrors.map((e, i) => (
                <div key={i} className="px-3 py-1 text-xs">
                  <span className="font-mono text-text-muted">{e.file}</span>:{" "}
                  <span className="text-yellow-700 dark:text-yellow-400">{e.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && (
          <div
            className={`px-3 py-2 rounded text-sm ${
              result.type === "success"
                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400"
            }`}
          >
            <div>{result.text}</div>
            {result.errors?.length > 0 && (
              <ul className="mt-1 list-disc list-inside text-xs">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    {e.name}: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

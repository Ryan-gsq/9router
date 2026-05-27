"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Select } from "@/shared/components";

const TARGET_OPTIONS = [
  { value: "headers", label: "Request Header" },
  { value: "body", label: "Request Body" },
];

const MODE_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "override", label: "Override" },
  { value: "block", label: "Block" },
];

function createRule() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    target: "headers",
    key: "",
    mode: "default",
    value: "",
  };
}

function normalizeRules(rules) {
  return (Array.isArray(rules) ? rules : []).map((rule) => ({
    id: rule.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    target: rule.target === "body" ? "body" : "headers",
    key: rule.key || "",
    mode: ["default", "override", "block"].includes(rule.mode) ? rule.mode : "default",
    value: rule.value ?? "",
  }));
}

export default function ProviderRequestTransformsCard({ value, onSave }) {
  const initialRules = useMemo(() => normalizeRules(value?.rules), [value]);
  const [rules, setRules] = useState(initialRules);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRules(initialRules);
    setSaved(false);
    setError("");
  }, [initialRules]);

  const updateRule = (id, patch) => {
    setSaved(false);
    setError("");
    setRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const addRule = () => {
    setSaved(false);
    setError("");
    setRules((prev) => [...prev, createRule()]);
  };

  const deleteRule = (id) => {
    setSaved(false);
    setError("");
    setRules((prev) => prev.filter((rule) => rule.id !== id));
  };

  const handleSave = async () => {
    const cleaned = rules.map((rule) => ({
      ...rule,
      key: rule.key.trim(),
    })).filter((rule) => rule.key);

    const invalid = cleaned.find((rule) => rule.mode !== "block" && rule.value === "");
    if (invalid) {
      setError("Value is required for Default and Override rules.");
      return;
    }

    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await onSave({ rules: cleaned.map((rule) => {
        if (rule.mode === "block") {
          const { value: _value, ...rest } = rule;
          return rest;
        }
        return rule;
      }) });
      setRules(cleaned);
      setSaved(true);
    } catch (err) {
      setError(err.message || "Failed to save request rewrite rules.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Request Rewrite Rules</h2>
          <p className="text-sm text-text-muted">Apply provider-wide request header/body rewrite rules.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon="add" onClick={addRule}>Add Rule</Button>
          <Button size="sm" icon="save" onClick={handleSave} loading={saving}>Save</Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {rules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-text-muted">No rewrite rules configured</div>
        ) : rules.map((rule) => (
          <div key={rule.id} className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-1 p-3 lg:grid-cols-[150px_1fr_140px_1fr_auto] lg:items-end">
            <Select
              label="Target"
              value={rule.target}
              options={TARGET_OPTIONS}
              onChange={(event) => updateRule(rule.id, { target: event.target.value })}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-main">Key or Path</label>
              <input
                value={rule.key}
                onChange={(event) => updateRule(rule.id, { key: event.target.value })}
                placeholder="Header name or dot path"
                className="w-full rounded-[10px] border border-transparent bg-surface-2 px-3 py-2.5 text-[16px] text-text-main transition-all duration-150 focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:text-sm"
              />
            </div>
            <Select
              label="Mode"
              value={rule.mode}
              options={MODE_OPTIONS}
              onChange={(event) => updateRule(rule.id, { mode: event.target.value })}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-main">Value</label>
              <input
                value={rule.value}
                onChange={(event) => updateRule(rule.id, { value: event.target.value })}
                disabled={rule.mode === "block"}
                placeholder={rule.mode === "block" ? "Delete or disallow this key/path" : "If empty, use configured value"}
                className="w-full rounded-[10px] border border-transparent bg-surface-2 px-3 py-2.5 text-[16px] text-text-main transition-all duration-150 focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
              />
            </div>
            <Button size="sm" variant="ghost" icon="delete" onClick={() => deleteRule(rule.id)} className="lg:mb-0.5">Delete Rule</Button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-1 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>Example: Authorization or messages.0.role</span>
        <span>{saved ? "Saved" : error}</span>
      </div>
    </Card>
  );
}

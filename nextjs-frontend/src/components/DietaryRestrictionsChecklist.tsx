"use client";

import { useMemo } from "react";

export type DietaryRestrictionKey =
  | "vegan"
  | "vegetarian"
  | "gluten-free"
  | "dairy-free"
  | "egg-free"
  | "nut-free"
  | "soy-free";

const OPTIONS: Array<{ key: DietaryRestrictionKey; label: string; hint: string }> = [
  { key: "vegan", label: "Vegan", hint: "No meat, fish, eggs, dairy, honey" },
  { key: "vegetarian", label: "Vegetarian", hint: "No meat or fish" },
  { key: "gluten-free", label: "Gluten-free", hint: "Avoid wheat/barley/rye" },
  { key: "dairy-free", label: "Dairy-free", hint: "Avoid milk, cheese, paneer, ghee" },
  { key: "egg-free", label: "Egg-free", hint: "Avoid eggs" },
  { key: "nut-free", label: "Nut-free", hint: "Avoid peanuts & tree nuts" },
  { key: "soy-free", label: "Soy-free", hint: "Avoid tofu, soy sauce, edamame" },
];

function normalizeList(value: string[] | undefined | null): DietaryRestrictionKey[] {
  const raw = Array.isArray(value) ? value : [];
  const cleaned = raw
    .map((v) => String(v ?? "").trim().toLowerCase())
    .filter(Boolean);

  const allowed = new Set(OPTIONS.map((o) => o.key));
  const out: DietaryRestrictionKey[] = [];
  for (const v of cleaned) {
    const key = v as DietaryRestrictionKey;
    if (!allowed.has(key)) continue;
    if (out.includes(key)) continue;
    out.push(key);
  }
  return out;
}

export function DietaryRestrictionsChecklist(props: {
  value: string[] | undefined;
  onChange: (next: DietaryRestrictionKey[]) => void;
  disabled?: boolean;
}) {
  const value = useMemo(() => normalizeList(props.value), [props.value]);

  function toggle(key: DietaryRestrictionKey) {
    const has = value.includes(key);
    const next = has ? value.filter((v) => v !== key) : [...value, key];
    props.onChange(next);
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.key}
            className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={value.includes(opt.key)}
              onChange={() => toggle(opt.key)}
              disabled={props.disabled}
            />
            <span className="grid gap-0.5">
              <span className="font-medium">{opt.label}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {value.length ? (
        <button
          type="button"
          className="self-start text-xs text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          onClick={() => props.onChange([])}
          disabled={props.disabled}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}

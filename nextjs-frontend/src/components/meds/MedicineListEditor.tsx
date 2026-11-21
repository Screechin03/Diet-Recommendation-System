"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { XIcon } from "@/components/report/icons";
import { inputClass, SearchIcon } from "@/components/care/ui";
import { searchMedicines, type MedicineEntry, type MedSuggestion } from "@/lib/meds";

export interface EditableMedicine extends MedicineEntry {
  key: string;
}

/** Search-as-you-type for brand or generic names; Enter adds whatever was typed. */
export function MedicineSearch({ onAdd, disabled }: { onAdd: (name: string) => void; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MedSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchMedicines(q, ctrl.signal)
        .then((r) => {
          setItems(r);
          setActive(0);
          setOpen(true);
        })
        .catch(() => undefined);
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function add(name: string) {
    if (!name.trim()) return;
    onAdd(name.trim());
    setQ("");
    setItems([]);
    setOpen(false);
  }

  const shown = q.trim().length >= 2 ? items : [];
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      add(open && shown[active] ? shown[active].name : q);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400"><SearchIcon size={16} /></span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        placeholder="Add a medicine: brand (Dolo, Shelcal) or generic name"
        aria-label="Add a medicine"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open && shown.length > 0}
        className={`${inputClass} pl-9`}
      />
      {open && shown.length ? (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          {shown.map((s, i) => (
            <li key={`${s.kind}-${s.name}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(s.name)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === active ? "bg-zinc-100 dark:bg-zinc-900" : ""}`}
              >
                <span className="font-medium">{s.name}</span>
                <span className="truncate text-xs text-zinc-500">{s.kind === "product" ? s.detail : "generic"}</span>
              </button>
            </li>
          ))}
          {!shown.some((s) => s.name.toLowerCase() === q.trim().toLowerCase()) ? (
            <li>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(q)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
                Add “{q.trim()}” as typed
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/** Rows of medicine / dose / how often, each editable and removable. */
export function MedicineRows({
  items,
  onChange,
  onRemove,
}: {
  items: EditableMedicine[];
  onChange: (key: string, patch: Partial<MedicineEntry>) => void;
  onRemove: (key: string) => void;
}) {
  if (!items.length) {
    return <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">No medicines yet. Add the ones you take, including vitamins and supplements.</p>;
  }
  const small = "w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950";
  return (
    <ul className="space-y-2">
      {items.map((m) => (
        <li key={m.key} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <input
              value={m.name}
              onChange={(e) => onChange(m.key, { name: e.target.value })}
              aria-label="Medicine name"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
            />
            <button type="button" onClick={() => onRemove(m.key)} aria-label={`Remove ${m.name}`} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-rose-600 dark:hover:bg-zinc-900">
              <XIcon size={14} />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input value={m.dose ?? ""} onChange={(e) => onChange(m.key, { dose: e.target.value })} placeholder="Dose, e.g. 500 mg" aria-label="Dose" className={small} />
            <input value={m.frequency ?? ""} onChange={(e) => onChange(m.key, { frequency: e.target.value })} placeholder="How often, e.g. 1-0-1, BD" aria-label="How often" className={small} />
          </div>
        </li>
      ))}
    </ul>
  );
}

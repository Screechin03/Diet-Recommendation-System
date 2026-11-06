"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatBytes } from "@/lib/report";
import { FileIcon, UploadIcon, XIcon } from "./icons";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
const MAX_BYTES = 10 * 1024 * 1024;

export function UploadDropzone({
  file,
  onFile,
  disabled,
}: {
  file: File | null;
  onFile: (file: File | null, error?: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // Browsers can't render HEIC, so only preview other image types.
  const preview = useMemo(
    () => (file && file.type.startsWith("image/") && !file.type.includes("hei") ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function accept(f: File | undefined) {
    if (!f) return;
    const okType = f.type === "application/pdf" || f.type.startsWith("image/") || /\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name);
    if (!okType) return onFile(null, "Please choose a PDF or a photo (JPG, PNG).");
    if (f.size > MAX_BYTES) return onFile(null, `That file is ${formatBytes(f.size)}. The limit is 10 MB.`);
    onFile(f);
  }

  if (file) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt="Selected document preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-500">
              <FileIcon size={28} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{file.name}</div>
          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {file.type === "application/pdf" ? "PDF · first page is scanned" : "Photo"} · {formatBytes(file.size)}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="mt-2 text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-400"
          >
            Choose a different file
          </button>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onFile(null)}
          aria-label="Remove file"
          className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
        >
          <XIcon />
        </button>
        <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => accept(e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        accept(e.dataTransfer.files?.[0]);
      }}
      className={[
        "group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
        dragging
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
          : "border-zinc-300 bg-zinc-50/60 hover:border-emerald-400 hover:bg-emerald-50/50 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-emerald-600",
      ].join(" ")}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-emerald-700 shadow-sm ring-1 ring-zinc-200 transition group-hover:scale-105 dark:bg-zinc-900 dark:text-emerald-400 dark:ring-zinc-700">
        <UploadIcon size={22} />
      </span>
      <span className="mt-4 text-sm font-semibold">Drop a prescription or lab report here</span>
      <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">or click to browse · PDF, JPG or PNG up to 10 MB</span>
      <input
        type="file"
        accept={ACCEPT}
        hidden
        disabled={disabled}
        onChange={(e) => accept(e.target.files?.[0])}
      />
    </label>
  );
}

"use client";

import type { ReactNode } from "react";
import { RequireRole } from "@/components/care/RequireRole";

/** Every page in the doctor portal (inbox, patients, records, profile) is for doctor accounts only. */
export default function DoctorPortalLayout({ children }: { children: ReactNode }) {
  return <RequireRole role="doctor">{children}</RequireRole>;
}

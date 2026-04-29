"use client";

import { useEffect } from "react";
import { applyTheme, readStoredTheme } from "./theme-utils";

export function ThemeBootstrap() {
  useEffect(() => {
    applyTheme(readStoredTheme());
  }, []);

  return null;
}

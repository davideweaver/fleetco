import { createContext, useContext } from "react";
import type { Role } from "@/nav/routes";

type Shell = {
  role: Role;
  /** Appends the current role to a path so links keep the lab settings. */
  href: (path: string) => string;
  /** Opens the global search palette. There is no banner to put a field in. */
  openSearch: () => void;
};

export const ShellContext = createContext<Shell>({
  role: "owner",
  href: (p) => p,
  openSearch: () => {},
});

export const useShell = () => useContext(ShellContext);

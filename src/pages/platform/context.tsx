import type { PlatformOverview, ProjectData } from "./types";
import { createContext, useContext } from "react";
export interface PlatformContextValue {
  overview: PlatformOverview | null;
  projectId: string;
  setProjectId: (id: string) => void;
  projectData: ProjectData | null;
  refresh: () => Promise<void>;
  busy: boolean;
  action: (work: () => Promise<unknown>, message?: string) => Promise<boolean>;
  error: string;
  openNew: (goal?: string) => void;
  switchAccount: (account: string) => Promise<boolean>;
}
export const PlatformContext = createContext<PlatformContextValue>(null!);
export const usePlatform = () => useContext(PlatformContext);

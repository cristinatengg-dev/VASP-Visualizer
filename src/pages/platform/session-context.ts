import { createContext, useContext } from "react";
import type { Role } from "./types";
export interface PlatformIdentity {
  userId: string;
  workspaceId: string;
  kind: "phone" | "demo";
  demoAccount?: "A" | "B";
  role: Role;
  maskedPhone: string;
  displayName: string;
  workspaceName: string;
}
interface AuthContext {
  identity: PlatformIdentity;
  logout: () => Promise<void>;
  switchDemo: (account: string) => Promise<boolean>;
  setDemoRole: (role: string) => Promise<void>;
}
export const Context = createContext<AuthContext>(null!);
export const usePlatformSession = () => useContext(Context);

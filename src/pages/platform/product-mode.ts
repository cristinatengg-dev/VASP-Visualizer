// Sandbox controls are excluded from production builds.
export const SANDBOX =
  import.meta.env.DEV && import.meta.env.VITE_KNOWLEDGE_DEV === "true";
export const PLATFORM_APP = import.meta.env.VITE_LEGACY_APP !== "true";

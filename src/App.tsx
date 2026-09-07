import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PLATFORM_APP } from "./pages/platform/product-mode";
const PlatformApp = lazy(() => import("./pages/platform/PlatformApp"));
const LegacyApp = lazy(() => import("./LegacyApp"));
export default function App() {
  return (
    <Suspense
      fallback={
        <div className="ep-auth-loading">
          <Loader2 className="ep-spin" aria-label="正在加载" />
        </div>
      }
    >
      {PLATFORM_APP ? <PlatformApp /> : <LegacyApp />}
    </Suspense>
  );
}

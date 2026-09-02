import { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { API_BASE_URL, PHONE_AUTH_ENABLED } from './config';
import { Routes, Route, Navigate } from 'react-router-dom';
import { VisualizationErrorBoundary } from './components/VisualizationErrorBoundary';

const GromacsTrajectoryViewer = lazy(() => import('./pages/GromacsTrajectoryViewer'));
const LoginPage = lazy(() => import('./components/LoginPage').then((module) => ({ default: module.LoginPage })));
const AccountDropdown = lazy(() => import('./components/AccountDropdown').then((module) => ({ default: module.AccountDropdown })));
const AgentGate = lazy(() => import('./components/AgentGate').then((module) => ({ default: module.AgentGate })));
const HeroSection = lazy(() => import('./components/HeroSection'));
const ControlPanel = lazy(() => import('./components/ControlPanel').then((module) => ({ default: module.ControlPanel })));
const Scene3D = lazy(() => import('./components/Scene3D').then((module) => ({ default: module.Scene3D })));
const Explore = lazy(() => import('./pages/Explore'));
const AgentWorkspace = lazy(() => import('./pages/AgentWorkspace'));
const Manual = lazy(() => import('./pages/Manual'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'));
const MaterialsExplorer = lazy(() => import('./pages/MaterialsExplorer'));
const NuclearMaterialsExplorer = lazy(() => import('./pages/NuclearMaterialsExplorer'));
const SupercapacitorMaterialsExplorer = lazy(() => import('./pages/SupercapacitorMaterialsExplorer'));
const HydrogenStorageMaterialsExplorer = lazy(() => import('./pages/HydrogenStorageMaterialsExplorer'));
const ThermalStorageMaterialsExplorer = lazy(() => import('./pages/ThermalStorageMaterialsExplorer'));
const FlowBatteryMaterialsExplorer = lazy(() => import('./pages/FlowBatteryMaterialsExplorer'));
const AerospaceMaterialsExplorer = lazy(() => import('./pages/AerospaceMaterialsExplorer'));
const MaterialsLibrary = lazy(() => import('./pages/MaterialsLibrary'));
const RenderingAgent = lazy(() => import('./agents/rendering'));
const ModelingAgent = lazy(() => import('./agents/modeling'));
const ComputeAgent = lazy(() => import('./agents/compute'));
const RuntimeInspector = lazy(() => import('./agents/runtime'));
const RetrievalAgent = lazy(() => import('./agents/retrieval'));
const VideoGenerator = lazy(() => import('./pages/VideoGenerator'));

const PageLoader: React.FC = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-[#F5F5F0]">
    <Loader2 className="h-8 w-8 animate-spin text-[#0A1128]" />
  </div>
);

const hasAuthSession = () => Boolean(
  localStorage.getItem('vasp_user_id') && localStorage.getItem('vasp_token'),
);

// Protected route when phone authentication is enabled.
const AppRoute: React.FC = () => {
  if (PHONE_AUTH_ENABLED && !hasAuthSession()) return <Navigate to="/login" replace />;
  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[#F5F5F0] p-6 gap-6">
      <ControlPanel />
      <div className="flex-1 h-full relative rounded-[24px] overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.05)] bg-white ring-1 ring-black/5">
        <AccountDropdown />
        <VisualizationErrorBoundary className="rounded-[24px]">
          <Scene3D />
        </VisualizationErrorBoundary>
      </div>
    </div>
  );
};

const AgentRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  if (PHONE_AUTH_ENABLED && !hasAuthSession()) return <Navigate to="/login" replace />;
  return children;
};

const HomePage: React.FC = () => <HeroSection />;

function App() {
  const [isAuthChecking, setIsAuthChecking] = useState(() => {
      if (!PHONE_AUTH_ENABLED) return false;
      return hasAuthSession();
  });

  useEffect(() => {
    const checkAuth = async () => {
        const userId = localStorage.getItem('vasp_user_id');
        const token = localStorage.getItem('vasp_token');
        
        if (userId && token) {
            try {
                const res = await fetch(`${API_BASE_URL}/user/${encodeURIComponent(userId)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (data?.success && data?.user) {
                    const { useStore } = await import('./store/useStore');
                    useStore.getState().setUser(data.user);
                } else {
                    localStorage.removeItem('vasp_token');
                    localStorage.removeItem('vasp_user_id');
                }
            } catch (e) {
                console.error("Auth check failed", e);
            }
        }
        
        setIsAuthChecking(false);
    };

    if (isAuthChecking) {
        checkAuth();
    }
  }, [isAuthChecking]);

  if (isAuthChecking) {
      return (
          <div className="flex w-screen h-screen items-center justify-center bg-white">
              <Loader2 className="w-8 h-8 text-[#2E4A8E] animate-spin" />
          </div>
      );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
      {/* 默认首页：HeroSection */}
      <Route path="/" element={<HomePage />} />
      {/* 登录页 */}
      <Route
        path="/login"
        element={
          !PHONE_AUTH_ENABLED || hasAuthSession()
            ? <Navigate to={PHONE_AUTH_ENABLED ? "/" : "/workspace"} replace />
            : <LoginPage />
        }
      />
      {/* 主应用（需要登录） */}
      <Route path="/app" element={<AppRoute />} />
      {/* 其他页面 */}
      <Route path="/explore" element={<AgentRoute><Explore /></AgentRoute>} />
      <Route path="/workspace" element={<AgentRoute><AgentWorkspace /></AgentRoute>} />
      <Route path="/agent" element={<AgentRoute><AgentWorkspace /></AgentRoute>} />
      <Route path="/materials" element={<AgentRoute><MaterialsLibrary /></AgentRoute>} />
      <Route path="/materials/battery" element={<AgentRoute><MaterialsExplorer /></AgentRoute>} />
      <Route path="/materials/nuclear" element={<AgentRoute><NuclearMaterialsExplorer /></AgentRoute>} />
      <Route path="/materials/supercapacitor" element={<AgentRoute><SupercapacitorMaterialsExplorer /></AgentRoute>} />
      <Route path="/materials/hydrogen-storage" element={<AgentRoute><HydrogenStorageMaterialsExplorer /></AgentRoute>} />
      <Route path="/materials/thermal-storage" element={<AgentRoute><ThermalStorageMaterialsExplorer /></AgentRoute>} />
      <Route path="/materials/flow-battery" element={<AgentRoute><FlowBatteryMaterialsExplorer /></AgentRoute>} />
      <Route path="/materials/aerospace" element={<AgentRoute><AerospaceMaterialsExplorer /></AgentRoute>} />
      <Route path="/manual" element={<Manual />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/cookie-policy" element={<CookiePolicy />} />
      <Route path="/admin/video-generator" element={<AgentRoute><VideoGenerator /></AgentRoute>} />
      {/* Agent 工作台 */}
      <Route path="/agent/rendering" element={<AgentRoute><AgentGate agent="rendering" label="Rendering Agent"><RenderingAgent /></AgentGate></AgentRoute>} />
      <Route path="/agent/retrieval" element={<AgentRoute><AgentGate agent="retrieval" label="Idea Agent"><RetrievalAgent /></AgentGate></AgentRoute>} />
      <Route path="/agent/modeling" element={<AgentRoute><AgentGate agent="modeling" label="Modeling Agent"><ModelingAgent /></AgentGate></AgentRoute>} />
      <Route
        path="/agent/modeling/gromacs"
        element={
          <AgentRoute>
            <AgentGate agent="modeling" label="Modeling Agent">
              <GromacsTrajectoryViewer />
            </AgentGate>
          </AgentRoute>
        }
      />
      <Route path="/agent/compute" element={<AgentRoute><AgentGate agent="compute" label="Compute Agent"><ComputeAgent /></AgentGate></AgentRoute>} />
      <Route path="/agent/runtime" element={<AgentRoute><RuntimeInspector /></AgentRoute>} />
      {/* 旧路由兼容 */}
      <Route path="/hero" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;

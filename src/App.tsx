import { ControlPanel } from './components/ControlPanel';
import { Scene3D } from './components/Scene3D';
import { LoginPage } from './components/LoginPage';
import { AccountDropdown } from './components/AccountDropdown';
import HeroSection from './components/HeroSection';
import Explore from './pages/Explore';
import Manual from './pages/Manual';
import RenderingAgent from './agents/rendering';
import ModelingAgent from './agents/modeling';
import ComputeAgent from './agents/compute';
import RuntimeInspector from './agents/runtime';
import { useStore } from './store/useStore';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { API_BASE_URL } from './config';
import { Routes, Route, Navigate } from 'react-router-dom';

// Protected route: redirect to /login if not authenticated
const AppRoute: React.FC = () => {
  const { user } = useStore();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[#F5F5F0] p-6 gap-6">
      <ControlPanel />
      <div className="flex-1 h-full relative rounded-[24px] overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.05)] bg-white ring-1 ring-black/5">
        <AccountDropdown />
        <Scene3D />
      </div>
    </div>
  );
};

function App() {
  const { user, setUser } = useStore();
  
  const [isAuthChecking, setIsAuthChecking] = useState(() => {
      const hasToken = !!(localStorage.getItem('vasp_user_id') && localStorage.getItem('vasp_token'));
      return hasToken && !user;
  });

  useEffect(() => {
    const checkAuth = async () => {
        const userId = localStorage.getItem('vasp_user_id');
        const token = localStorage.getItem('vasp_token');
        
        if (userId && token) {
            if (user) {
                setIsAuthChecking(false);
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/user/${userId}`);
                const data = await res.json();
                if (data?.success && data?.user) {
                    setUser(data.user);
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
  }, []);

  if (isAuthChecking) {
      return (
          <div className="flex w-screen h-screen items-center justify-center bg-white">
              <Loader2 className="w-8 h-8 text-[#2E4A8E] animate-spin" />
          </div>
      );
  }

  return (
    <Routes>
      {/* 默认首页：HeroSection */}
      <Route path="/" element={<HeroSection />} />
      {/* 登录页 */}
      <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginPage />} />
      {/* 主应用（需要登录） */}
      <Route path="/app" element={<AppRoute />} />
      {/* 其他页面 */}
      <Route path="/explore" element={<Explore />} />
      <Route path="/manual" element={<Manual />} />
      {/* Agent 工作台 */}
      <Route path="/agent/rendering" element={<RenderingAgent />} />
      <Route path="/agent/modeling" element={<ModelingAgent />} />
      <Route path="/agent/compute" element={<ComputeAgent />} />
      <Route path="/agent/runtime" element={<RuntimeInspector />} />
      {/* 旧路由兼容 */}
      <Route path="/hero" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

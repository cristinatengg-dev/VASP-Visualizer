import { SANDBOX } from "./product-mode";
import { RequirementsFields } from "./ResearchFields";
import type { PlatformOverview, ProjectData, ResearchProject } from "./types";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Blocks,
  CircleHelp,
  FlaskConical,
  FolderOpen,
  Home,
  Loader2,
  LockKeyhole,
  Menu,
  MessageSquare,
  Plus,
  Settings2,
  Wallet,
  X,
} from "lucide-react";
import { PlatformContext } from "./context";
import { PlatformAuthBoundary } from "./Auth";
import { usePlatformSession } from "./session-context";
import { platformApi, money } from "./api";
import { Dialog, ErrorNote } from "./ui";
import Landing from "./Landing";
import Guide from "./Guide";
import "./platform.css";
const Research = lazy(() => import("./Research"));
const Accounts = lazy(() => import("./Accounts"));
const Resources = lazy(() => import("./Resources"));
const Knowledge = lazy(() => import("../knowledge/KnowledgeCenter"));
const Assistant = lazy(() => import("./Assistant"));

export default function PlatformApp() {
  return (
    <PlatformAuthBoundary>
      <PlatformWorkspace />
    </PlatformAuthBoundary>
  );
}
function PlatformWorkspace() {
  const auth = usePlatformSession();
  const rememberedKey = "eliangmat-project-" + auth.identity.workspaceId;
  const [overview, setOverview] = useState<PlatformOverview | null>(null),
    [projectId, setProject] = useState(""),
    [projectData, setProjectData] = useState<ProjectData | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [newProject, setNewProject] = useState(false),
    [mobile, setMobile] = useState(false);
  const epoch = useRef(0),
    pid = useRef(""),
    ready = useRef(false);
  pid.current = projectId;
  ready.current = !!overview;
  const navigate = useNavigate(),
    location = useLocation();
  const homepage = location.pathname === "/";
  const setProjectId = useCallback((id: string) => {
    epoch.current++;
    pid.current = id;
    setProject(id);
    setProjectData(null);
    setError("");
    setNotice("");
  }, []);
  const refresh = useCallback(async () => {
    const current = epoch.current;
    const next = await platformApi<PlatformOverview>("/api/platform");
    if (current !== epoch.current) return;
    setOverview(next);
    let id = pid.current;
    if (!next.projects.some((p) => p.id === id)) {
      const remembered = localStorage.getItem(rememberedKey);
      id =
        next.projects.find((p) => p.id === remembered)?.id ||
        next.projects.find((p) => p.workflow)?.id ||
        next.projects[0]?.id ||
        "";
      pid.current = id;
      setProject(id);
    }
    if (id && next.role !== "finance") {
      const data = await platformApi<ProjectData>(
        "/api/platform/projects/" + id,
      );
      if (current === epoch.current && pid.current === id) setProjectData(data);
    } else setProjectData(null);
  }, [rememberedKey]);
  useEffect(() => {
    refresh().catch((e) => {
      if (e.status !== 401) setError(e.message);
    });
  }, [refresh]);
  useEffect(() => {
    if (projectId) refresh().catch((e) => setError(e.message));
  }, [projectId, refresh]);
  useEffect(() => {
    setMobile(false);
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, left: 0 });
    if (ready.current) refresh().catch((e) => setError(e.message));
  }, [location.pathname, refresh]); // Navigation refresh keeps data-center changes in sync.
  useEffect(() => {
    if (overview && projectId) localStorage.setItem(rememberedKey, projectId);
  }, [overview, projectId, rememberedKey]);
  async function action(work: () => Promise<unknown>, message = "") {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await refresh();
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const switchAccount = (account: string) => auth.switchDemo(account);
  async function logout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await auth.logout();
    } catch (e) {
      setError(e instanceof Error ? e.message : "退出失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  const [newGoal, setNewGoal] = useState("");
  const role = overview?.role || "owner";
  const create = async (form: HTMLFormElement, demo = false) => {
    const input = Object.fromEntries(new FormData(form));
    await action(
      async () => {
        const project = await platformApi<ResearchProject>(
          "/api/platform/projects",
          {
            ...input,
            demo,
          },
        );
        setProjectId(project.id);
        setNewProject(false);
        navigate("/workspace");
      },
      demo
        ? "独立演练项目已创建，所有示例结果均有标识。"
        : "项目已按账号默认设置创建；研究路线等待确认。",
    );
  };
  const createDemo = () =>
    action(async () => {
      const project = await platformApi<ResearchProject>(
        "/api/platform/projects",
        {
          name: "高强铝合金研发 · 演练",
          goal: "开发高强铝合金，目标屈服强度 ≥350 MPa、延伸率 ≥8%，下一轮最多 6 个样品。",
          family: "铝合金",
          demo: true,
        },
      );
      setProjectId(project.id);
      navigate("/workspace");
    }, "已建立演练项目，示例结果不能作为真实科研证据。");
  const links = [
    { to: "/assistant", label: "对话", icon: MessageSquare },
    { to: "/workspace", label: "研发项目", icon: FolderOpen },
    { to: "/laboratory", label: "实验室", icon: FlaskConical },
    { to: "/tools", label: "工具与模型", icon: Blocks },
    { to: "/knowledge", label: "材料与证据", icon: BookOpen },
    { to: "/account/defaults", label: "账号与用量", icon: Settings2 },
  ];
  return (
    <PlatformContext.Provider
      value={{
        overview,
        projectId,
        setProjectId,
        projectData,
        refresh,
        busy,
        action,
        error,
        openNew: (goal = "") => {
          setNewGoal(goal);
          setNewProject(true);
        },
        switchAccount,
      }}
    >
      {homepage ? (
        <Suspense
          fallback={
            <div className="ep-loading">
              <Loader2 className="ep-spin" />
            </div>
          }
        >
          <Landing />
        </Suspense>
      ) : (
        <div className="ep-app">
          {mobile && (
            <button
              className="ep-mobile-shade"
              aria-label="收起导航"
              onClick={() => setMobile(false)}
            />
          )}
          <aside className={"ep-sidebar " + (mobile ? "ep-mobile-open" : "")}>
            <Link className="ep-brand" to="/">
              <span>E</span>
              <div>
                EliangMat AI<small>材料研发工作区</small>
              </div>
            </Link>
            <button
              className="ep-new"
              disabled={busy || !overview || role === "finance"}
              onClick={() => setNewProject(true)}
            >
              <Plus size={16} />
              新建研究
            </button>
            <nav>
              {links
                .filter(
                  (l) => role !== "finance" || l.to.startsWith("/account"),
                )
                .map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className={
                      (
                        l.to.startsWith("/account")
                          ? location.pathname.startsWith("/account")
                          : location.pathname.startsWith(l.to)
                      )
                        ? "active"
                        : ""
                    }
                  >
                    <l.icon size={17} />
                    {l.label}
                  </Link>
                ))}
            </nav>
            <div className="ep-sidebar-label">当前项目</div>
            <label className="ep-project-picker">
              <FolderOpen size={15} />
              <select
                aria-label="切换研发项目"
                disabled={!overview || busy || !overview.projects.length}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="" disabled>
                  选择项目
                </option>
                {overview?.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {projectId && role !== "finance" && (
              <div className="ep-project-tree">
                {projectData?.workflow && (
                  <>
                    <Link to="/workspace">
                      第 {projectData.workflow.round} 轮研究<span>当前</span>
                    </Link>
                    <Link to="/workspace/review">拉伸数据质量复核</Link>
                    <Link to="/workspace/plan">研究路线与前置条件</Link>
                  </>
                )}
              </div>
            )}
            <div className="ep-sidebar-bottom">
              <Link to="/platform-guide">
                <CircleHelp size={16} />
                使用指南
              </Link>
              <Link to="/">
                <Home size={15} />
                官网首页
              </Link>
              <details className="ep-user-menu">
                <summary
                  className="ep-user"
                  aria-label="账号菜单"
                  role="button"
                >
                  <span>{auth.identity.kind === "demo" ? "测" : "我"}</span>
                  <div>
                    {auth.identity.displayName}
                    <small>
                      {overview?.settings.spaceName ||
                        auth.identity.workspaceName}{" "}
                      ·{" "}
                      {role === "owner"
                        ? "所有者"
                        : role === "finance"
                          ? "财务"
                          : "研究员"}
                    </small>
                  </div>
                </summary>
                <div className="ep-user-options">
                  <Link to="/account/defaults">账号与用量</Link>
                  <button disabled={busy} onClick={logout}>
                    退出登录
                  </button>
                  {SANDBOX && <Link to="/login?development=1">开发测试</Link>}
                </div>
              </details>
            </div>
          </aside>
          <main className="ep-main">
            <header className="ep-top">
              <button
                aria-label="展开导航"
                className="ep-mobile-menu ep-icon"
                onClick={() => setMobile(true)}
              >
                <Menu size={18} />
              </button>
              <div className="ep-current">
                <strong>
                  {location.pathname.startsWith("/account")
                    ? "账号与用量"
                    : location.pathname === "/assistant"
                      ? "EliangMat AI"
                      : location.pathname === "/knowledge"
                        ? "材料与证据"
                        : location.pathname === "/tools"
                          ? "工具与模型"
                          : location.pathname === "/laboratory"
                            ? "实验室"
                            : location.pathname === "/platform-guide"
                              ? "使用指南"
                              : overview?.projects.find(
                                  (p) => p.id === projectId,
                                )?.name || "研发项目"}
                </strong>
                {projectData?.workflow?.demo &&
                  location.pathname.startsWith("/workspace") && (
                    <span className="ep-test-tag">演练项目</span>
                  )}
              </div>
              <div className="ep-top-right">
                {SANDBOX && (
                  <span className="ep-environment">
                    <i />
                    独立开发环境
                  </span>
                )}
                {SANDBOX && overview?.wallet && (
                  <Link className="ep-wallet-link" to="/account/billing">
                    <Wallet size={14} />
                    {money(overview.wallet.available)}
                    <small>测试</small>
                  </Link>
                )}
                {SANDBOX && auth.identity.kind === "demo" && (
                  <Link className="ep-test-account" to="/login?development=1">
                    {auth.identity.displayName} · 演练
                  </Link>
                )}
              </div>
            </header>
            {error && (
              <div className="ep-global-error" role="alert">
                <span>{error}</span>
                <button
                  className="ep-icon"
                  aria-label="关闭错误提示"
                  onClick={() => setError("")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {notice && (
              <div className="ep-notice" role="status">
                {notice}
              </div>
            )}
            {!overview ? (
              <div className="ep-loading">
                <Loader2 className="ep-spin" />
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="ep-loading">
                    <Loader2 className="ep-spin" />
                  </div>
                }
              >
                <Routes>
                  <Route
                    path="/assistant"
                    element={
                      role === "finance" ? (
                        <Navigate to="/account/billing" replace />
                      ) : (
                        <Assistant key={overview.account + role} />
                      )
                    }
                  />
                  <Route
                    path="/workspace/*"
                    element={
                      role === "finance" ? (
                        <Navigate to="/account/billing" replace />
                      ) : (
                        <Research
                          key={overview.account + projectId}
                          createDemo={createDemo}
                        />
                      )
                    }
                  />
                  <Route
                    path="/laboratory"
                    element={
                      role === "finance" ? (
                        <Navigate to="/account/billing" replace />
                      ) : (
                        <Resources
                          key={overview.account + role + "lab"}
                          page="lab"
                        />
                      )
                    }
                  />
                  <Route
                    path="/tools"
                    element={
                      role === "finance" ? (
                        <Navigate to="/account/billing" replace />
                      ) : (
                        <Resources
                          key={overview.account + role + "tools"}
                          page="tools"
                        />
                      )
                    }
                  />
                  <Route
                    path="/knowledge"
                    element={
                      role === "finance" ? (
                        <Navigate to="/account/billing" replace />
                      ) : (
                        <div className="ep-knowledge">
                          <Knowledge
                            key={overview.account + projectId}
                            initialProjectId={projectId}
                            embedded
                            onChange={refresh}
                          />
                        </div>
                      )
                    }
                  />
                  <Route
                    path="/workspace/settings/*"
                    element={
                      <Accounts
                        scope="project"
                        key={overview.account + projectId + role + "settings"}
                      />
                    }
                  />
                  <Route
                    path="/account/*"
                    element={<Accounts key={overview.account + role} />}
                  />
                  <Route path="/platform-guide" element={<Guide />} />
                  <Route
                    path="*"
                    element={<Navigate to="/workspace" replace />}
                  />
                </Routes>
              </Suspense>
            )}
          </main>
        </div>
      )}
      {newProject && (
        <Dialog
          title="新建材料研究"
          close={() => !busy && setNewProject(false)}
        >
          <form
            className="ep-form"
            onSubmit={(e) => {
              e.preventDefault();
              create(e.currentTarget);
            }}
          >
            <label>
              项目名称
              <input
                autoFocus
                name="name"
                required
                maxLength={100}
                placeholder="例如：高温镍基合金研发"
              />
            </label>
            <label>
              材料体系
              <input name="family" defaultValue="合金" required />
            </label>
            <RequirementsFields initial={{ goal: newGoal }} />
            <div className="ep-inline-note">
              <LockKeyhole size={16} />
              本项目采用账号默认：
              {overview?.defaults.mode === "contribute"
                ? "参与优化候选集"
                : "私密"}{" "}
              ·{" "}
              {
                overview?.models.find((m) => m.id === overview.defaults.model)
                  ?.name
              }
              。确认路线后再推进。
            </div>
            <ErrorNote message={error} />
            <button className="ep-primary" disabled={busy}>
              创建并起草研究路线
              <ArrowRight size={16} />
            </button>
          </form>
        </Dialog>
      )}
    </PlatformContext.Provider>
  );
}

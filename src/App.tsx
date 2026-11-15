/** App shell 与路由（ADR-0009：无全局顶栏——Brand Float 常驻 + 各区头部分担职责；
    Q11：URL 路由；设置壳为独立整页双栏，预览路由并入其侧栏） */
import { useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { useSessions, type SessionsState } from "./state/sessions";
import { BrandFloat } from "./features/shell/BrandFloat";
import { Sidebar } from "./features/sidebar/Sidebar";
import { SessionBar } from "./features/sessionbar/SessionBar";
import { SessionView } from "./features/session/SessionView";
import { ComponentGallery } from "./routes/ComponentGallery";
import { SettingsShell } from "./features/settings/SettingsShell";
import { AppearanceSection } from "./features/settings/AppearanceSection";
import { AboutSection } from "./features/settings/AboutSection";
import { Icon } from "./ui/Icon";
import styles from "./app.module.css";
import transcriptStyles from "./features/transcript/transcript.module.css";

function Home({ sessions }: { sessions: SessionsState }) {
  if (sessions.loading) {
    return (
      <div className={transcriptStyles.emptyState}>
        <Icon name="sparkles" size={28} />
        <span>Loading sessions…</span>
      </div>
    );
  }
  const first = sessions.sessions[0];
  if (first) return <Navigate to={`/session/${first.id}`} replace />;
  return (
    <div className={transcriptStyles.emptyState}>
      <Icon name="sparkles" size={28} />
      <strong>Welcome to Pi Studio</strong>
      <span>Run pi in any project, then pick a session from the sidebar.</span>
    </div>
  );
}

export default function App() {
  const sessions = useSessions();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { pathname } = useLocation();
  // 设置壳（ADR-0009）替换主壳；Brand Float 两种壳下都常驻
  const settingsRoute = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <div className={styles.shell}>
      {/* Brand Float：固定视口左上角；
          设置壳下 hover 显示返回钮，主壳下显示侧栏开关 */}
      <BrandFloat
        mode={settingsRoute ? "back" : "sidebar"}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
      {settingsRoute ? (
        <Routes>
          <Route path="/settings" element={<SettingsShell />}>
            <Route index element={<Navigate to="appearance" replace />} />
            <Route path="preview" element={<ComponentGallery />} />
            <Route path="appearance" element={<AppearanceSection />} />
            <Route path="about" element={<AboutSection />} />
            <Route path="*" element={<Navigate to="/settings/appearance" replace />} />
          </Route>
        </Routes>
      ) : (
        <div className={styles.body}>
          {/* 侧栏常驻，收起用宽度动画（ADR-0009） */}
          <Sidebar {...sessions} collapsed={sidebarCollapsed} />
          <main className={styles.main}>
            <SessionBar sessions={sessions} collapsed={sidebarCollapsed} />
            <div className={styles.mainContent}>
              <Routes>
                <Route path="/" element={<Home sessions={sessions} />} />
                {/* 旧组件总览路由并入设置壳的 Preview 分区 */}
                <Route
                  path="/overview"
                  element={<Navigate to="/settings/preview" replace />}
                />
                <Route path="/session/:id" element={<SessionView />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

/** App shell 与路由（ADR-0009：无全局顶栏——Brand Float 常驻 + 各区头部分担职责；
    Q11：URL 路由；设置壳为独立整页双栏，预览路由并入其侧栏。
    MainShell：主壳布局路由——useSessionDetail 单订阅，SessionBar 纯展示，detail 经 outlet 下发；
    Session 列表与驱动状态由消费端直订 store（ADR-0015），App 不再经 props 中转 */
import { useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { useSessions, useSessionSummary } from "./state/sessions";
import { useSessionDetail, type SessionDetailState } from "./state/useSessionDetail";
import { currentSessionId } from "./state/current-session";
import { drive, useDriveSession } from "./state/use-drive";
import { useLocale } from "./state/useLocale";
import { BrandFloat } from "./features/shell/BrandFloat";
import { Sidebar } from "./features/sidebar/Sidebar";
import { SessionBar, type SessionBarDrive } from "./features/sessionbar/SessionBar";
import { SessionView } from "./features/session/SessionView";
import { ComponentGallery } from "./routes/ComponentGallery";
import { TranscriptLab } from "./features/transcript/lab/TranscriptLab";
import { SettingsShell } from "./features/settings/SettingsShell";
import { AppearanceSection } from "./features/settings/AppearanceSection";
import { AboutSection } from "./features/settings/AboutSection";
import { Icon } from "./components/Icon";
import styles from "./app.module.css";
import transcriptStyles from "./features/transcript/transcript.module.css";

function Home() {
  const { t } = useLocale();
  const sessions = useSessions();
  if (sessions.loading) {
    return (
      <div className={transcriptStyles.emptyState}>
        <Icon name="sparkles" size={28} />
        <span>{t("loadingSessions")}</span>
      </div>
    );
  }
  const first = sessions.sessions[0];
  if (first) return <Navigate to={`/session/${first.id}`} replace />;
  return (
    <div className={transcriptStyles.emptyState}>
      <Icon name="sparkles" size={28} />
      <strong>{t("welcomeTitle")}</strong>
      <span>{t("welcomeHint")}</span>
    </div>
  );
}

/** 主壳布局路由：当前 Session 的 URL 契约、详情订阅与 SessionBar 派生的唯一归属 */
function MainShell({ collapsed }: { collapsed: boolean }) {
  const { pathname } = useLocation();
  const { t } = useLocale();
  const id = currentSessionId(pathname);
  const detail = useSessionDetail(id);
  const driveSession = useDriveSession(id);
  const session = useSessionSummary(id);
  const title = session
    ? (session.name ?? session.title ?? t("untitledSession"))
    : "Pi Studio";

  // 驱动动作区（ADR-0012 补记十一 Send-to-Attach）：解除侧保留——已驱动的 session 总能解除
  // （含 create 出、尚未进 REST 列表的新会话）；接管动作已并入首条发送，不再有 attach 钮
  const barDrive: SessionBarDrive | undefined = id && driveSession
    ? {
        status: driveSession.status,
        onRelease: () => drive.release(id),
      }
    : undefined;

  return (
    <>
      <SessionBar title={title} branched={detail.view.abandonedCount > 0} collapsed={collapsed} drive={barDrive} />
      <div className={styles.mainContent}>
        <Outlet context={detail satisfies SessionDetailState} />
      </div>
    </>
  );
}

export default function App() {
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
            <Route path="transcript" element={<TranscriptLab />} />
            <Route path="appearance" element={<AppearanceSection />} />
            <Route path="about" element={<AboutSection />} />
            <Route path="*" element={<Navigate to="/settings/appearance" replace />} />
          </Route>
        </Routes>
      ) : (
        <div className={styles.body}>
          {/* 侧栏常驻，收起用宽度动画（ADR-0009） */}
          <Sidebar collapsed={sidebarCollapsed} />
          <main className={styles.main}>
            <Routes>
              <Route element={<MainShell collapsed={sidebarCollapsed} />}>
                <Route path="/" element={<Home />} />
                {/* 旧组件总览路由并入设置壳的 Preview 分区 */}
                <Route
                  path="/overview"
                  element={<Navigate to="/settings/preview" replace />}
                />
                <Route path="/session/:id" element={<SessionView />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </main>
        </div>
      )}
    </div>
  );
}

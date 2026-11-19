/** App shell 与路由（ADR-0009：无全局顶栏——Brand Float 常驻 + 各区头部分担职责；
    Q11：URL 路由；设置壳为独立整页双栏，预览路由并入其侧栏。
    MainShell：主壳布局路由——useSessionDetail 单订阅，SessionBar 纯展示，detail 经 outlet 下发；
    Session 列表与驱动状态由消费端直订 store（ADR-0015），App 不再经 props 中转 */
import { useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { useSessions, useSessionSummary } from "./state/sessions";
import { useSessionDetail, type SessionDetailState } from "./state/useSessionDetail";
import { currentSessionId } from "./state/current-session";
import { drive, useConnectionError, useDriveSession } from "./state/use-drive";
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
import { Button } from "./components/Button";
import { EmptyState } from "./components/EmptyState";
import styles from "./app.module.css";

function Home() {
  const { t } = useLocale();
  const sessions = useSessions();
  if (sessions.loading) {
    return <EmptyState icon="sparkles" hint={t("loadingSessions")} />;
  }
  const first = sessions.sessions[0];
  if (first) return <Navigate to={`/session/${first.id}`} replace />;
  return <EmptyState icon="sparkles" title={t("welcomeTitle")} hint={t("welcomeHint")} />;
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

/** 单客户端租约被占（ADR-0012 补记十六）：整页阻断——另一窗口正持有本服务的唯一控制连接。
    主壳不渲染（半可用界面比明说更糟），但 Brand Float 依 ADR-0009 无例外常驻：
    此页没有 Sidebar 可开关，故以 static 形态只呈 π。 */
function ServerBusy() {
  const { t } = useLocale();
  return (
    <>
      <BrandFloat mode="static" />
      <EmptyState
        icon="warning"
        title={t("errServerBusy")}
        hint={t("errServerBusyHint")}
        className={styles.busy}
        titleClassName={styles.busyTitle}
      >
        <Button onClick={() => drive.reconnect()}>{t("retryConnect")}</Button>
      </EmptyState>
    </>
  );
}

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { pathname } = useLocation();
  const connectionError = useConnectionError();
  // 租约被占：第二个页面整页阻断（其余连接级错误仍走 SessionView 顶部错误条）
  if (connectionError?.code === "serverBusy") {
    return (
      <div className={styles.shell}>
        <ServerBusy />
      </div>
    );
  }
  // 设置壳（ADR-0009）替换主壳；Brand Float 各壳下都常驻
  const settingsRoute = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <div className={styles.shell}>
      {/* Brand Float：固定视口左上角，各壳常驻；主壳下 hover π 换成侧栏开关，
          Settings 与阻断态只呈品牌（ADR-0009 补记二） */}
      {settingsRoute ? (
        <BrandFloat mode="static" />
      ) : (
        <BrandFloat
          mode="sidebar"
          onToggle={() => setSidebarCollapsed((value) => !value)}
        />
      )}
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

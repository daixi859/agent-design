import { useState } from "react";

import { Button } from "../components";
import { ThemeProvider } from "../components/ThemeProvider";
import { useTheme } from "../lib/theme-context";
import { THEMES } from "../lib/theme";
import { cn } from "../lib/cn";
import { AgentPage } from "./AgentPage";
import { ComponentGallery } from "./ComponentGallery";
import { TokenPage } from "./TokenPage";

type Route = "agent" | "components" | "tokens";

/** 预览站页头：路由切换 + 主题快切（主题状态来自 ThemeProvider）。 */
function PreviewHeader({
  route,
  onRouteChange,
}: {
  route: Route;
  onRouteChange: (route: Route) => void;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex h-10 shrink-0 items-center gap-4 border-b border-border bg-header px-4">
      <div className="flex items-baseline gap-2">
        <span className="text-ui-base font-semibold">zcode-ui</span>
        <span className="text-ui-xs text-foreground-subtle">ZCode 基础组件 · 预览</span>
      </div>
      <nav className="flex items-center gap-1">
        {(
          [
            ["agent", "Agent 运行台"],
            ["components", "组件"],
            ["tokens", "令牌"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onRouteChange(value)}
            data-state={route === value ? "active" : "inactive"}
            className={cn(
              "inline-flex h-6 items-center rounded-md px-2 text-ui-sm transition-colors",
              route === value
                ? "bg-selected font-medium text-foreground"
                : "text-foreground-subtle hover:bg-hover hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        {THEMES.map((item) => (
          <Button
            key={item.value}
            size="xs"
            variant={theme === item.value ? "secondary" : "ghost"}
            onClick={() => setTheme(item.value)}
            aria-pressed={theme === item.value}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </header>
  );
}

/** 预览站外壳：ThemeProvider + 页头 + 内容区（组件 / 令牌两页）。 */
export function PreviewApp() {
  const [route, setRoute] = useState<Route>("agent");

  return (
    <ThemeProvider>
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <PreviewHeader route={route} onRouteChange={setRoute} />
        <main
          className={cn(
            "min-h-0 flex-1",
            route === "agent" ? "overflow-hidden" : "overflow-y-auto",
          )}
        >
          {route === "agent" ? (
            <AgentPage />
          ) : route === "components" ? (
            <ComponentGallery />
          ) : (
            <TokenPage />
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}

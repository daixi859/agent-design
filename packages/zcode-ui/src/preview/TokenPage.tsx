import { GalleryPage, GallerySection } from "./GallerySection";

function Swatch({ token }: { token: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
      <span
        aria-hidden="true"
        className="size-3.5 rounded-sm border border-border"
        style={{ background: `var(${token})` }}
      />
      <code className="text-ui-xs text-foreground-subtle">{token}</code>
    </span>
  );
}

export function TokenPage() {
  const surfaceTokens = [
    "--color-background",
    "--color-background-alt",
    "--color-header",
    "--color-panel",
    "--color-sidebar",
    "--color-surface",
    "--color-surface-hover",
    "--color-hover",
    "--color-selected",
    "--color-card",
    "--color-card-selected",
    "--color-popover",
    "--color-popover-header",
    "--color-menu",
    "--color-menu-hover",
    "--color-input",
    "--color-input-focused",
    "--color-tab",
    "--color-tab-active",
    "--color-tooltip",
    "--color-toast",
    "--color-tag",
  ];
  const textTokens = [
    "--color-foreground",
    "--color-foreground-subtle",
    "--color-foreground-subtlest",
    "--color-foreground-inverse",
    "--color-primary",
    "--color-primary-foreground",
    "--color-secondary",
    "--color-muted",
    "--color-muted-foreground",
  ];
  const borderTokens = [
    "--color-border",
    "--color-border-hover",
    "--color-card-border",
    "--color-popover-border",
    "--color-input-border",
    "--color-input-border-hover",
    "--color-input-border-focused",
    "--color-ring",
  ];
  const statusTokens = [
    "--color-brand",
    "--color-success",
    "--color-warning",
    "--color-destructive",
    "--color-success-surface",
    "--color-warning-surface",
    "--color-destructive-surface",
    "--color-interaction-ask-surface",
    "--color-interaction-confirmation-surface",
    "--color-progress-surface",
    "--color-diff-added",
    "--color-diff-removed",
    "--color-accent",
  ];
  const usageTokens = [
    "--color-usage-chart-1",
    "--color-usage-chart-2",
    "--color-usage-chart-3",
    "--color-usage-chart-4",
    "--color-usage-chart-5",
    "--color-usage-chart-6",
  ];

  return (
    <GalleryPage title="CSS 令牌">
      <GallerySection title="表面（surface）" description="面板 / 弹层 / 输入面等表面语义，随主题切换。">
        <div className="flex flex-wrap gap-2">
          {surfaceTokens.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
      </GallerySection>
      <GallerySection title="文本（text）" description="前景层级与主色。">
        <div className="flex flex-wrap gap-2">
          {textTokens.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
      </GallerySection>
      <GallerySection title="描边与焦点（border / ring）" description="发丝线、hover 加深与聚焦环。">
        <div className="flex flex-wrap gap-2">
          {borderTokens.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
      </GallerySection>
      <GallerySection title="状态与反馈" description="成功 / 警告 / 危险、交互与 diff 语义色。">
        <div className="flex flex-wrap gap-2">
          {statusTokens.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
      </GallerySection>
      <GallerySection title="图表（usage chart）" description="用量图表专用色板，避免复用终端 ANSI 高饱和色。">
        <div className="flex flex-wrap gap-2">
          {usageTokens.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
      </GallerySection>
      <GallerySection title="字号刻度（text-ui-*）" description="以 --ui-font-size（14px）为基线的 calc 刻度。">
        <div className="flex flex-col gap-1.5">
          <span className="text-ui-settings-title-lg">settings-title-lg</span>
          <span className="text-ui-settings-title">settings-title</span>
          <span className="text-ui-xl">text-ui-xl</span>
          <span className="text-ui-lg">text-ui-lg</span>
          <span className="text-ui-base">text-ui-base</span>
          <span className="text-ui-caption">text-ui-caption</span>
          <span className="text-ui-sm">text-ui-sm</span>
          <span className="text-ui-xs">text-ui-xs</span>
          <span className="text-ui-xs">text-ui-xs</span>
        </div>
      </GallerySection>
      <GallerySection title="动效令牌" description="流式动效统一口径（duration / ease）。">
        <div className="flex flex-wrap gap-2 font-mono text-ui-xs">
          {[
            "--zcode-reveal-duration",
            "--zcode-reveal-ease",
            "--zcode-enter-duration",
            "--zcode-enter-ease",
            "--shadow-composer-soft",
          ].map((token) => (
            <code key={token} className="rounded-md border border-border bg-card px-2 py-1 text-foreground-subtle">
              {token}
            </code>
          ))}
        </div>
      </GallerySection>
    </GalleryPage>
  );
}
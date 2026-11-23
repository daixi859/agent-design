import type { ReactNode } from "react";

/** 预览站图例容器：标题 + 说明 + 展示面。组件页与令牌页共用同一版式。 */
export function GallerySection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-ui-lg font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-ui-sm text-foreground-subtle">{description}</p>
        ) : null}
      </div>
      <div className="rounded-xl border border-border bg-card/40 p-4">{children}</div>
    </section>
  );
}

/** 预览页外壳：标题 + 纵向内容流。 */
export function GalleryPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-6" data-gallery-page={title}>
      <h1 className="text-ui-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

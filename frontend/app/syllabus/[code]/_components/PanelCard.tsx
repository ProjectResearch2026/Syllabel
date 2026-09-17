import type { LucideIcon } from "lucide-react";

/**
 * タブの中に並ぶカード（ui-design_pc.pen 06_講義詳細 Card_*）。
 *
 * 見出し行だけ区切り線で分け、本文は 20px の余白に置く。見出しの右には
 * 件数や注記を添えられる（「全15回」「進度により内容が前後する場合があります」）。
 */
export default function PanelCard({
  icon: Icon,
  title,
  count,
  note,
  children,
  className = "",
  bodyClassName = "gap-3.5",
}: {
  icon: LucideIcon;
  title: string;
  /** 見出しの右に添える小さな数（例: 全15回） */
  count?: string;
  /** 見出し行の右端に置く注記 */
  note?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** 本文の内側。表のように余白を潰したいときに上書きする */
  bodyClassName?: string;
}) {
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-xl border border-border-primary bg-surface-primary ${className}`}
    >
      <div className="flex items-center justify-between gap-4 border-b border-card-divider px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-fg-primary">
          <Icon size={15} className="shrink-0 text-accent" aria-hidden="true" />
          {title}
          {count && <span className="text-[11px] font-semibold text-fg-muted">{count}</span>}
        </h2>
        {note}
      </div>
      <div className={`flex flex-col p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** 箇条書きの1項目。設計では小さな丸と本文の2列（Item / Note）。 */
export function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="mt-[9px] size-1 shrink-0 rounded-full bg-fg-icon"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 text-[12.5px] leading-[22px] text-fg-secondary">
        {children}
      </span>
    </li>
  );
}

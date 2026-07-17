import type { Project } from '../../../content/projects';

/** 專案性質標籤 — mono 英文(工程圖注記慣例,兩語系一致) */
const LABELS: Record<Project['domain'], string> = {
  fullstack: 'FULL STACK',
  backend: 'BACKEND',
  frontend: 'FRONTEND',
  mobile: 'MOBILE APP',
  ai: 'AI TOOLING',
};

export function DomainBadge({ domain }: { domain: Project['domain'] }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-[4px] border border-line-2 px-1.5 py-0.5 align-middle font-mono text-[10px] tracking-[0.08em] text-muted">
      {LABELS[domain]}
    </span>
  );
}

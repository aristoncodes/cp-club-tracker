import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useMe } from '../ui';

type AButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'void'; small?: boolean };

export function AButton({ variant = 'primary', small, className = '', ...props }: AButtonProps) {
  const look = { primary: 'bg-lime text-ink font-extrabold', secondary: 'border border-line font-bold', danger: 'border border-line font-bold text-pink-text', void: 'bg-pink text-ink font-extrabold' }[variant];
  return <button className={`lift cursor-pointer rounded-full disabled:cursor-default disabled:opacity-50 ${small ? 'min-h-8 px-3 text-xs' : 'min-h-10 px-4'} ${look} ${className}`} {...props} />;
}

const CHIPS = {
  ok: 'bg-lime-tint text-lime',
  wait: 'bg-sun-tint text-sun',
  problem: 'bg-pink-tint text-pink-soft',
  info: 'bg-[#13263A] text-[#7DD3FC]',
  admin: 'bg-violet-tint text-violet-soft',
  plain: 'bg-card-2 text-text',
};

export function Chip({ tone = 'plain', children }: { tone?: keyof typeof CHIPS; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-xs font-bold ${CHIPS[tone]}`}>{children}</span>;
}

export function PageHeader({ title, line, action }: { title: string; line: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="display text-[38px] leading-none tracking-[-0.035em]">{title}</h1>
        <p className="mt-1.5 text-muted">{line}</p>
      </div>
      {action}
    </div>
  );
}

export function ATable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-[20px] border border-line bg-card">{children}</div>;
}

export function AToggle({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button aria-pressed={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={`relative h-[26px] w-11 shrink-0 cursor-pointer rounded-full disabled:opacity-50 ${on ? 'bg-lime' : 'bg-line'}`}>
      <span className={`absolute top-[3px] size-5 rounded-full bg-ink ${on ? 'left-[21px]' : 'left-[3px]'}`} />
    </button>
  );
}

export function Stepper({ value, label, step = 1, changed, onChange }: { value: number; label: string; step?: number; changed: boolean; onChange: (value: number) => void }) {
  const button = 'flex size-[34px] cursor-pointer items-center justify-center rounded-full bg-card-2 font-bold';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border p-0.5 ${changed ? 'border-lime' : 'border-transparent'}`}>
      <button aria-label={`Less ${label}`} className={button} onClick={() => onChange(Math.max(0, Math.round((value - step) * 100) / 100))}>−</button>
      <span className="num min-w-12 text-center">{value}</span>
      <button aria-label={`More ${label}`} className={button} onClick={() => onChange(Math.round((value + step) * 100) / 100)}>+</button>
    </span>
  );
}

export function Segmented<T extends string | number>({ tabs, value, onChange, label }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-card p-1">
      {tabs.map((tab) => (
        <button key={String(tab.id)} role="tab" aria-selected={tab.id === value} onClick={() => onChange(tab.id)} className={`min-h-8 cursor-pointer rounded-full px-3 text-xs font-bold ${tab.id === value ? 'bg-white text-ink' : 'text-muted'}`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const focusable = () => [...(box.current?.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]') ?? [])];
    focusable()[1]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(8,8,12,.75)] p-4">
      <div ref={box} role="dialog" aria-modal="true" aria-label={title} className={`flex w-full flex-col gap-3 rounded-[20px] border border-line bg-card p-6 ${wide ? 'max-w-[640px]' : 'max-w-[560px]'}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="display text-[22px]">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="flex size-10 cursor-pointer items-center justify-center text-xl">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useAct(onDone?: () => void) {
  const { reload } = useMe();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(work: () => Promise<unknown>): Promise<boolean> {
    setError('');
    setBusy(true);
    try {
      await work();
      onDone?.();
      reload();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { run, error, busy };
}

export const fieldClass = 'h-11 w-full rounded-2xl border border-line bg-ink px-4 text-text outline-none focus:border-lime';

const PLATFORM_CHIPS: Record<string, [string, string]> = {
  cf: ['bg-[#13263A] text-[#60A5FA]', 'Codeforces'],
  cc: ['bg-[#2A1A0E] text-orange', 'CodeChef'],
  leetcode: ['bg-sun-tint text-sun', 'LeetCode'],
  atcoder: ['bg-card-2 text-white', 'AtCoder'],
  other: ['bg-violet-tint text-violet-soft', 'Club'],
};

export function PlatformChip({ platform, wide }: { platform: string; wide?: boolean }) {
  const [look, label] = PLATFORM_CHIPS[platform] ?? PLATFORM_CHIPS.other;
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full px-2.5 py-[3px] text-xs font-bold ${look} ${wide ? 'w-[86px]' : ''}`}>{label}</span>;
}

// The browser's date-time field has no zone, so its value is read as IST.
export const istInputToUnix = (value: string) => Date.parse(`${value}+05:30`) / 1000;
export const unixToIstDate = (ts: number) => new Date((ts + 19800) * 1000).toISOString().slice(0, 10);

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ratingColor } from 'shared/rating-color';
import { REASONS } from 'shared/reasons';
import { formatIST } from 'shared/time';
import type { Contest, Me } from './api';

export type ShellContext = { me: Me; reload: () => void };

export const useMe = () => useOutletContext<ShellContext>();

export const PLATFORMS = [
  { id: 'cf', label: 'Codeforces', required: true },
  { id: 'cc', label: 'CodeChef', required: true },
  { id: 'leetcode', label: 'LeetCode', required: false },
  { id: 'atcoder', label: 'AtCoder', required: false },
];

export const platformLabel = (id: string) => PLATFORMS.find((p) => p.id === id)?.label ?? id;

export const inputClass = 'h-11 w-full rounded-2xl border border-line bg-card px-4 text-text outline-none focus:border-lime';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'warning' | 'danger' | 'onViolet' };

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-lime text-ink font-extrabold',
    secondary: 'border-2 border-line text-text font-bold',
    warning: 'bg-sun text-ink font-extrabold',
    danger: 'border-2 border-line text-pink font-bold',
    onViolet: 'border-2 border-violet-soft text-white font-bold',
  }[variant];
  return (
    <button
      className={`lift h-11 cursor-pointer rounded-full px-5 disabled:cursor-default disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-line bg-card p-5 ${className}`}>{children}</div>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 self-start rounded-full border border-line bg-card p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
          className={`min-h-11 cursor-pointer rounded-full px-5 font-bold ${tab.id === value ? 'bg-lime text-ink' : 'text-muted hover:text-text'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Rating({ value, children }: { value: number | null; children?: ReactNode }) {
  return (
    <span className="handle" style={{ color: ratingColor(value ?? 0) }}>
      {children ?? value ?? '—'}
    </span>
  );
}

export function RatingChip({ value }: { value: number }) {
  return (
    <span className="num inline-block rounded-full bg-card-2 px-2 py-0.5 text-xs" style={{ color: ratingColor(value) }}>
      {value}
    </span>
  );
}

const AVATAR_COLORS = ['bg-lime', 'bg-pink', 'bg-sun', 'bg-sky', 'bg-lilac', 'bg-orange'];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? '?'}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
}

export function Avatar({ userId, name, size = 36 }: { userId: number; name: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-ink ${AVATAR_COLORS[userId % AVATAR_COLORS.length]}`}
    >
      {initials(name)}
    </span>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <img src="/icon-192.png" alt="" className="size-[34px] -rotate-6 rounded-[10px]" />
      <span className="display text-xl">
        OOPS <span className="text-lime">CLUB</span>
      </span>
    </span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="inline-block rounded-full bg-violet-tint px-3 py-1 text-xs font-bold text-violet-soft">{children}</span>;
}

export function ProgressBar({ percent, color, height = 10 }: { percent: number; color: string; height?: number }) {
  return (
    <div className="overflow-hidden rounded-full bg-card-2" style={{ height }}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

export function Flame() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c1 4 6 6 6 12a6 6 0 0 1-12 0c0-2.500 1-4 2.500-5 .2 1.700 1 2.700 2 3 .5-3-.5-6 1.500-10z" />
    </svg>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-pink">{children}</p>;
}

export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    setError('');
    load()
      .then((result) => current && setData(result))
      .catch((err: Error) => current && setError(err.message));
    return () => {
      current = false;
    };
  }, [...deps, version]);
  return { data, error, reload: () => setVersion((v) => v + 1) };
}

const CODE_COLORS: Record<string, string> = { cf: 'text-cf-blue', cc: 'text-orange', atcoder: 'text-text', leetcode: 'text-sun' };
const CODES: Record<string, string> = { cf: 'CF', cc: 'CC', atcoder: 'AC', leetcode: 'LC' };

export function PlatformCode({ platform }: { platform: string }) {
  return <span className={`handle text-xs ${CODE_COLORS[platform] ?? 'text-text'}`}>{CODES[platform] ?? platform}</span>;
}

export function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      aria-pressed={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[30px] w-[52px] shrink-0 cursor-pointer rounded-full transition-colors duration-150 ${on ? 'bg-lime' : 'bg-line'}`}
    >
      <span className={`absolute top-[3px] size-6 rounded-full transition-all duration-150 ${on ? 'left-[25px] bg-ink' : 'left-[3px] bg-muted'}`} />
    </button>
  );
}

const PILLS: Record<string, string> = {
  lime: 'bg-lime-tint text-lime',
  sun: 'bg-sun-tint text-sun-text',
  pink: 'bg-pink-tint text-pink-text',
  muted: 'bg-card-2 text-muted',
};

export function Pill({ tone, children }: { tone: keyof typeof PILLS & string; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold ${PILLS[tone]}`}>{children}</span>;
}

const RSVP_PILLS = {
  yes: <Pill tone="lime">Going</Pill>,
  no: <Pill tone="pink">Can't make it</Pill>,
};

export function ContestRow({ contest }: { contest: Contest }) {
  const [date, time] = formatIST(contest.startAt).split(' · ');
  const [weekday, day] = date.split(', ');
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-[14px] bg-card-2">
        <span className="text-[10px] font-bold text-muted uppercase">{weekday}</span>
        <span className="num text-base leading-none">{day.split(' ')[0]}</span>
      </span>
      <div className="min-w-0 flex-1">
        <a href={contest.url} target="_blank" rel="noreferrer" className="block truncate font-bold hover:underline">{contest.name}</a>
        <p className="text-xs text-muted"><span className={contest.platform === 'cf' ? 'text-cf-blue' : 'text-orange'}>{platformLabel(contest.platform)}</span> · {time}</p>
      </div>
      {RSVP_PILLS[contest.rsvp as 'yes' | 'no'] ?? <Pill tone="muted">Not answered</Pill>}
    </div>
  );
}

export function CellMark({ status, reasonType }: { status: string | null | undefined; reasonType: string | null | undefined }) {
  const base = 'num flex size-6 shrink-0 items-center justify-center rounded-[7px] text-xs text-ink';
  if (!status) return <span className={`${base} bg-card-2`} />;
  if (status === 'present') return <span className={`${base} bg-lime`}>✓</span>;
  if (!reasonType) return <span className="num flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 border-dashed border-sun text-xs text-sun">?</span>;
  return <span className={`${base} bg-pink`}>{REASONS.find((r) => r.id === reasonType)?.letter ?? 'O'}</span>;
}

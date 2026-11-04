import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ratingColor } from 'shared/rating-color';
import type { Me } from './api';

export type ShellContext = { me: Me; reload: () => void };

export const useMe = () => useOutletContext<ShellContext>();

export const PLATFORMS = [
  { id: 'cf', label: 'Codeforces', required: true },
  { id: 'cc', label: 'CodeChef', required: true },
  { id: 'leetcode', label: 'LeetCode', required: false },
  { id: 'atcoder', label: 'AtCoder', required: false },
];

export const platformLabel = (id: string) => PLATFORMS.find((p) => p.id === id)?.label ?? id;

export const inputClass =
  'h-11 w-full rounded-lg border border-border bg-surface-2 px-3 text-text outline-none focus:border-accent';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' };

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-accent text-bg',
    secondary: 'bg-surface-2 text-text',
    danger: 'bg-surface-2 text-absent',
  }[variant];
  return (
    <button
      className={`h-11 cursor-pointer rounded-lg px-4 font-semibold transition-opacity duration-150 ease-out hover:opacity-85 disabled:cursor-default disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-surface p-4 ${className}`}>{children}</div>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 self-start rounded-lg border border-border bg-surface p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
          className={`min-h-11 cursor-pointer rounded-lg px-4 font-medium ${tab.id === value ? 'bg-surface-2 text-accent' : 'text-muted'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Rating({ value, children }: { value: number | null; children?: ReactNode }) {
  return (
    <span className="num" style={{ color: ratingColor(value ?? 0) }}>
      {children ?? value ?? '—'}
    </span>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-absent">{children}</p>;
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

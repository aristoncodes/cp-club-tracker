function isBelow(version: string, target: string): boolean {
  const a = version.split('.').map(Number);
  const b = target.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

export function appVersionAction(current: string, latest: string, min: string): 'none' | 'optional' | 'required' {
  if (isBelow(current, min)) return 'required';
  return isBelow(current, latest) ? 'optional' : 'none';
}

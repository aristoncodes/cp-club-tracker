import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { timeAgo } from 'shared/time';
import { api } from '../api';
import { Avatar, Button, Card, ErrorText, platformLabel, RatingChip } from '../ui';

type FeedItem = {
  kind: 'solve' | 'duel';
  id?: number;
  text?: string;
  userId: number;
  name: string;
  username: string | null;
  platform: string;
  problemId: string;
  problemName: string | null;
  url: string | null;
  tags: string[];
  rp: number;
  points: number;
  live: number;
  solvedAt: number;
};

const PAGE_SIZE = 30;
const REFRESH_MS = 60_000;

export function Feed() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');

  async function load(before?: number) {
    try {
      const page = await api<FeedItem[]>(`/feed${before ? `?before=${before}` : ''}`);
      setItems((current) => (before ? [...(current ?? []), ...page] : page));
      setMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(async () => {
      const page = await api<FeedItem[]>('/feed').catch(() => []);
      setItems((current) => [...page.filter((item) => item.solvedAt > (current?.[0]?.solvedAt ?? 0)), ...(current ?? [])]);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const now = Date.now() / 1000;
  return (
    <div className="flex max-w-[800px] flex-col gap-4">
      <h1 className="display text-[52px] leading-none tracking-[-0.035em]">Feed</h1>
      {error && <ErrorText>{error}</ErrorText>}
      {items?.length === 0 && <Card><p className="text-muted">No solves yet. Be the first on the board.</p></Card>}
      {!!items?.length && (
        <Card className="flex flex-col gap-4">
          {items.map((item) => item.kind === 'duel' ? (
            <Link key={`duel-${item.id}`} to={`/duel/${item.id}`} className="flex items-center gap-3 hover:underline">
              <span className="num flex size-9 shrink-0 items-center justify-center rounded-full bg-pink text-xs text-ink">VS</span>
              <div className="min-w-0 flex-1">
                <p>{item.text}</p>
                <p className="text-xs text-muted">{timeAgo(item.solvedAt, now)}</p>
              </div>
            </Link>
          ) : (
            <div key={`${item.userId}-${item.platform}-${item.problemId}`} className="flex items-start gap-3">
              <Avatar userId={item.userId} name={item.name} />
              <div className="min-w-0 flex-1">
                <p>
                  <Link to={`/u/${item.userId}`} className="font-bold hover:underline">{item.name}</Link>{item.username ? <span className="handle text-xs text-muted"> @{item.username}</span> : null} solved{' '}
                  <a href={item.url ?? undefined} target="_blank" rel="noreferrer" className="hover:underline">{item.problemName ?? item.problemId}</a> on {platformLabel(item.platform)}
                </p>
                <p className="text-xs text-muted">
                  {[...item.tags.slice(0, 3), timeAgo(item.solvedAt, now)].join(' · ')}{item.live ? ' · live' : ''} · <span className="num text-lime">+{item.points}</span>
                </p>
              </div>
              <RatingChip value={item.rp} />
            </div>
          ))}
        </Card>
      )}
      {more && items && (
        <div><Button variant="secondary" onClick={() => load(items[items.length - 1].solvedAt)}>Show more</Button></div>
      )}
    </div>
  );
}

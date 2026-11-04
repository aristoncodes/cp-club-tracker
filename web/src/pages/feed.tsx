import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { timeAgo } from 'shared/time';
import { api } from '../api';
import { Button, Card, ErrorText, platformLabel, Rating } from '../ui';

type FeedItem = {
  userId: number;
  name: string;
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
  }, []);

  const now = Date.now() / 1000;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Feed</h1>
      {error && <ErrorText>{error}</ErrorText>}
      {items?.length === 0 && <p className="text-muted">No solves yet. Be the first on the board.</p>}
      {!!items?.length && (
        <Card className="flex flex-col divide-y divide-border p-0">
          {items.map((item) => (
            <div key={`${item.userId}-${item.platform}-${item.problemId}`} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <Link to={`/u/${item.userId}`} className="font-medium hover:underline">{item.name}</Link>{' '}
                <span className="text-muted">solved</span> <Rating value={item.rp} />
                <a href={item.url ?? undefined} target="_blank" rel="noreferrer" className="block truncate hover:underline">
                  {item.problemName ?? item.problemId}
                </a>
                <p className="text-xs text-muted">
                  {[platformLabel(item.platform), ...item.tags.slice(0, 3), timeAgo(item.solvedAt, now)].join(' · ')}
                  {item.live ? ' · live' : ''}
                </p>
              </div>
              <span className="num shrink-0 text-accent">+{item.points}</span>
            </div>
          ))}
        </Card>
      )}
      {more && items && (
        <Button variant="secondary" onClick={() => load(items[items.length - 1].solvedAt)}>Show more</Button>
      )}
    </div>
  );
}

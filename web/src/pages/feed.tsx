import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { timeAgo } from 'shared/time';
import { api } from '../api';
import { Button, ErrorText, platformLabel, Rating } from '../ui';

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
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">Feed</h1>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <table className="data-table">
          <thead>
            <tr>
              <th className="hidden sm:table-cell">When</th>
              <th>Who</th>
              <th>Problem</th>
              <th className="right">Rating</th>
              <th className="right">Points</th>
            </tr>
          </thead>
          <tbody>
            {items?.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">No solves yet. Be the first on the board.</td>
              </tr>
            )}
            {items?.map((item) => (
              <tr key={`${item.userId}-${item.platform}-${item.problemId}`}>
                <td className="hidden whitespace-nowrap text-muted sm:table-cell">{timeAgo(item.solvedAt, now)}</td>
                <td><Link to={`/u/${item.userId}`} className="link font-medium">{item.name}</Link></td>
                <td className="min-w-0">
                  <a href={item.url ?? undefined} target="_blank" rel="noreferrer" className="link">{item.problemName ?? item.problemId}</a>
                  <p className="text-xs text-muted">
                    {[platformLabel(item.platform), ...item.tags.slice(0, 3)].join(' · ')}{item.live ? ' · live' : ''}
                  </p>
                </td>
                <td className="right"><Rating value={item.rp} /></td>
                <td className="num right font-bold text-accent">+{item.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && items && (
        <div><Button variant="secondary" onClick={() => load(items[items.length - 1].solvedAt)}>Show more</Button></div>
      )}
    </div>
  );
}

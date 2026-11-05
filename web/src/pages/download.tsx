import { Link } from 'react-router-dom';
import { Card, Logo } from '../ui';

export function Download() {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-6 py-8">
      <Link to="/" aria-label="OOPS.Grind home"><Logo /></Link>
      <h1 className="display text-4xl tracking-[-0.035em]">Get the app</h1>
      <Card className="flex flex-col items-start gap-3">
        <h2 className="display text-xl">Android</h2>
        <p className="text-muted">Download the app, open the file and allow the install when your phone asks.</p>
        <a className="lift inline-flex h-11 items-center rounded-full bg-lime px-5 font-extrabold text-ink" href={import.meta.env.VITE_APK_URL}>Download APK</a>
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="display text-xl">iPhone</h2>
        <ol className="flex list-inside list-decimal flex-col gap-1 text-muted">
          <li>Open this site in Safari.</li>
          <li>Tap Share, then Add to Home Screen.</li>
          <li>Open it from your Home Screen, open Settings, and turn on notifications.</li>
        </ol>
      </Card>
      <Link to="/login" className="font-bold text-lime hover:underline">← Back to sign in</Link>
    </main>
  );
}

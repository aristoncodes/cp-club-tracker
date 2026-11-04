import { Card } from '../ui';

export function Download() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Get CP Club Tracker</h1>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Android</h2>
        <p className="mb-4 text-muted">Download the app, open the file and allow the install when your phone asks.</p>
        <a className="inline-flex h-11 items-center rounded-lg bg-accent px-4 font-semibold text-bg" href={import.meta.env.VITE_APK_URL}>
          Download APK
        </a>
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">iPhone</h2>
        <p className="text-muted">
          Open this site in Safari, tap Share, then Add to Home Screen. Open it from there, go to Me, and turn on notifications.
        </p>
      </Card>
    </main>
  );
}

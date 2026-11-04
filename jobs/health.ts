import { getHealth, healthProblems, type WorkflowRun } from './lib';

async function recentRuns(workflow: string): Promise<WorkflowRun[]> {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/${workflow}.yml/runs?per_page=10`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'User-Agent': 'cp-club-tracker' },
  });
  if (!response.ok) throw new Error(`GitHub runs for ${workflow} returned ${response.status}`);
  const { workflow_runs: runs } = (await response.json()) as { workflow_runs: { created_at: string; conclusion: string | null }[] };
  return runs.map((run) => ({ createdAt: Date.parse(run.created_at) / 1000, conclusion: run.conclusion }));
}

const workflows = ['sync-solves', 'sync-contests', 'participation', 'backfill'] as const;
const runs = Object.fromEntries(await Promise.all(workflows.map(async (w) => [w, await recentRuns(w)])));
const problems = healthProblems(await getHealth(), runs, Math.floor(Date.now() / 1000));

if (problems.length) {
  for (const problem of problems) console.error(`PROBLEM: ${problem}`);
  process.exitCode = 1;
} else {
  console.log('All healthy');
}

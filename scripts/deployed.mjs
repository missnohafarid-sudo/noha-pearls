// `npm run deployed`: after a change is shipped, waits for GitHub's check-and-deploy run and says whether the site shows it.
import { git, stop } from './lib/process.mjs';

const API = 'https://api.github.com';
const WORKFLOW_FILE = 'deploy.yml';
const POLL_SECONDS = 30;
const GIVE_UP_MINUTES = 9;
const HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'deploy-status' };
const UNKNOWN = 2;
const AGAIN_ADVICE = 'Run `npm run deployed` again in a few minutes.';

const sha = git('rev-parse', 'HEAD').output;
if (git('rev-parse', 'origin/main').output !== sha) stop('UNKNOWN: the last change on this computer has not been shipped yet. Ship it first with: npm run ship -- "message"', UNKNOWN);

const [owner, name] = git('remote', 'get-url', 'origin').output.replace(/\.git$/, '').split(/[/:]/).filter(Boolean).slice(-2);
const repo = `${owner}/${name}`;
const actionsAddress = `https://github.com/${repo}/actions`;

async function getJson(path) {
  const response = await fetch(`${API}/repos/${repo}/${path}`, { headers: HEADERS });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  return response.json();
}

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

function unknown(reason) {
  stop(`UNKNOWN: could not tell yet whether the site shows this change. ${reason}\n${AGAIN_ADVICE}\n${actionsAddress}`, UNKNOWN);
}

async function failedJobLines(run) {
  try {
    const { jobs } = await getJson(`actions/runs/${run.id}/jobs`);
    return jobs
      .filter((job) => job.conclusion === 'failure')
      .map((job) => `Failed: ${job.name}, at step "${job.steps?.find((step) => step.conclusion === 'failure')?.name ?? 'unknown'}"`);
  } catch {
    return [];
  }
}

async function latestRun() {
  const { workflow_runs: runs } = await getJson(`actions/workflows/${WORKFLOW_FILE}/runs?head_sha=${sha}&per_page=1`);
  return runs[0];
}

const waitingMessages = { none: 'Waiting: GitHub has not started the online check yet...', queued: 'Waiting: the online check is queued...', in_progress: 'Waiting: the online check is running...' };
const deadline = Date.now() + GIVE_UP_MINUTES * 60 * 1000;
let lastState;
let run;

while (true) {
  try {
    run = await latestRun();
  } catch (error) {
    unknown(`${error.message}.`);
  }
  const state = run?.status ?? 'none';
  if (state === 'completed') break;
  if (state !== lastState) console.log(waitingMessages[state] ?? `Waiting: the online check is ${state}...`);
  lastState = state;
  if (Date.now() + POLL_SECONDS * 1000 > deadline) unknown(`The online check is still not finished after ${GIVE_UP_MINUTES} minutes.`);
  await sleep(POLL_SECONDS);
}

if (run.conclusion === 'success') {
  console.log('LIVE: the site now shows this change.');
} else if (run.conclusion !== 'failure') {
  unknown(`The online run ended as "${run.conclusion}".`);
} else {
  const lines = await failedJobLines(run);
  stop(['NOT LIVE: the online check or the deploy failed.', ...lines, run.html_url].join('\n'));
}

// `npm run deployed`: after a change is shipped, waits for GitHub's check-and-deploy run and says whether the site shows it.
import { git, stop } from './lib/process.mjs';
import { fetchMain, TRY_BRANCH } from './lib/shipping.mjs';

const API = 'https://api.github.com';
const WORKFLOW_FILE = 'deploy.yml';
const POLL_SECONDS = 30;
const GIVE_UP_MINUTES = 9;
const HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'deploy-status' };
const UNKNOWN = 2;
const MAX_ANNOTATIONS = 15;
const MAX_ANNOTATION_LINES = 12;
const GENERIC_ANNOTATION = 'Process completed with exit code';
const AGAIN_ADVICE = 'Run `npm run deployed` again in a few minutes.';

const sha = git('rev-parse', 'HEAD').output;
const shippedAt = (branch) => git('rev-parse', '--verify', '--quiet', `origin/${branch}`).output;
if (sha !== shippedAt(TRY_BRANCH) && sha !== shippedAt('main')) stop('UNKNOWN: the last change on this computer has not been shipped yet. Ship it first with: npm run ship -- "message"', UNKNOWN);

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

async function runJobs(run) {
  try {
    return (await getJson(`actions/runs/${run.id}/jobs`)).jobs;
  } catch {
    return [];
  }
}

const failedStepName = (job) => job.steps?.find((step) => step.conclusion === 'failure')?.name ?? 'unknown';

function annotationBlock(annotation) {
  const place = `${annotation.path}:${annotation.start_line}`;
  const message = annotation.message.split('\n').slice(0, MAX_ANNOTATION_LINES).map((line) => `  ${line}`);
  return [annotation.title ? `${place} ${annotation.title}` : place, ...message].join('\n');
}

async function failureBlocks(job) {
  try {
    const annotations = await getJson(`check-runs/${job.id}/annotations?per_page=50`);
    return annotations
      .filter((annotation) => annotation.annotation_level === 'failure' && !annotation.message.startsWith(GENERIC_ANNOTATION))
      .slice(0, MAX_ANNOTATIONS)
      .map(annotationBlock);
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

const notLive = (sentence) => stop(`NOT LIVE: ${sentence}\n${run.html_url}`);

function explainDeployFailure(job) {
  fetchMain();
  if (git('merge-base', '--is-ancestor', sha, 'origin/main').status === 0) {
    notLive(`the change passed the online check and is in main, but the deploy failed at step "${failedStepName(job)}". The site may show the old version or a new one that does not work.`);
  }
  if (git('rev-parse', 'origin/main').output !== git('rev-parse', `${sha}^`).output) {
    notLive("the change passed the online check but could not be published, because the site's code changed meanwhile. Ship again once: `npm run ship` puts the change on top of the newer code.");
  }
  notLive('the change passed the online check, but GitHub refused to publish it. The maintainer is needed.');
}

async function explainCheckFailure(job) {
  const blocks = await failureBlocks(job);
  if (blocks.length === 0) {
    notLive(`the online check could not run (step "${failedStepName(job)}"), so nothing reached the site. This is not a fault in the code. Ship again once; if the same happens, the maintainer is needed.`);
  }
  stop(['NOT LIVE: the online check failed, so nothing reached the site. What failed:', ...blocks, run.html_url, 'Fix the code and ship again.'].join('\n'));
}

if (run.conclusion === 'success') {
  fetchMain();
  console.log('LIVE: the site now shows this change.');
} else if (run.conclusion === 'cancelled') {
  notLive('the online check was cancelled before it finished, because a newer change took its place. Ship again.');
} else if (run.conclusion !== 'failure') {
  unknown(`The online run ended as "${run.conclusion}".`);
} else {
  const failedJob = (await runJobs(run)).find((job) => job.conclusion === 'failure');
  if (failedJob?.name === 'check') await explainCheckFailure(failedJob);
  if (failedJob?.name === 'deploy') explainDeployFailure(failedJob);
  unknown('The online run failed, but its details could not be read.');
}

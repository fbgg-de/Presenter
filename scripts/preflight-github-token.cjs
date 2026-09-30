'use strict';

/**
 * Verify the GitHub token before a publish does any work.
 *
 * Checking that GH_TOKEN is merely *set* is not worth much: the common failures are a token
 * that expired, and a token that belongs to the wrong account — several GitHub tokens in one
 * shell profile is normal, and `GITHUB_TOKEN` is a popular name for a work one. Both cases
 * used to surface as a bare 401/403 from deep inside the upload, after a full build had
 * already run.
 *
 * So resolve the token the same way electron-builder does and ask GitHub two questions up
 * front: who is this, and can they write to the release repo.
 */

const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const yaml = require('js-yaml');

const repoRoot = dirname(__dirname);

/**
 * electron-builder resolves GH_TOKEN before GITHUB_TOKEN, so the preflight has to agree with
 * it — validating a token the publish will not use would be worse than not checking at all.
 */
function resolveToken() {
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN']) {
    const value = process.env[name];
    if (value && value.trim()) return { name, token: value.trim() };
  }
  return null;
}

/** The `publish:` block is the single source of truth for which repo a release belongs to. */
function publishTarget() {
  const config = yaml.load(readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8'));
  const publish = config?.publish;

  if (!publish || publish.provider !== 'github') {
    throw new Error('electron-builder.yml has no GitHub publish configuration');
  }

  return publish;
}

async function api(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'presenter-publish-preflight',
    },
  });

  return { status: response.status, body: await response.json().catch(() => ({})) };
}

function fail(lines) {
  console.error(`\n\x1b[31m✖ GitHub publish preflight failed\x1b[0m`);
  for (const line of lines) console.error(`  ${line}`);
  console.error('');
  return false;
}

/**
 * Returns true when the resolved token can write releases to the configured repo, and prints
 * an actionable diagnosis when it cannot. Never throws for an auth problem — the caller
 * decides how to exit.
 */
async function preflightGitHubToken() {
  const resolved = resolveToken();
  const { owner, repo } = publishTarget();
  const slug = `${owner}/${repo}`;

  if (!resolved) {
    return fail([
      'No token found. Set GH_TOKEN (preferred) or GITHUB_TOKEN.',
      `It needs write access to ${slug} — a fine-grained token with "Contents: Read and write",`,
      'or a classic token with the `repo` scope.',
    ]);
  }

  const { name, token } = resolved;
  const other = name === 'GH_TOKEN' ? 'GITHUB_TOKEN' : null;
  const shadowed = other && process.env[other] ? ` (${other} is also set but ${name} takes precedence)` : '';

  const identity = await api('/user', token);

  if (identity.status === 401) {
    return fail([
      `${name} is not a valid GitHub token — the API rejected it with 401 Bad credentials.`,
      'It has most likely expired or been revoked. Issue a new one and replace it.',
      ...(other && process.env[other] ? [`${other} is also set; ${name} is the one being used.`] : []),
    ]);
  }

  if (identity.status !== 200) {
    return fail([`Could not verify ${name}: GitHub returned ${identity.status}.`, String(identity.body?.message ?? '')]);
  }

  const login = identity.body?.login ?? 'unknown';
  const access = await api(`/repos/${owner}/${repo}`, token);

  if (access.status === 404) {
    return fail([
      `${name} authenticates as "${login}", but ${slug} is not visible to that account.`,
      'Either the token belongs to the wrong account, or it is a fine-grained token that was',
      `never granted access to ${slug}.`,
    ]);
  }

  if (access.status !== 200) {
    return fail([`Cannot read ${slug} as "${login}": GitHub returned ${access.status}.`, String(access.body?.message ?? '')]);
  }

  if (!access.body?.permissions?.push) {
    return fail([
      `"${login}" can see ${slug} but has no write access, so uploading a release asset will 403.`,
      'Use a token for an account with push rights, or widen the token scope.',
    ]);
  }

  console.log(`  ✓ ${name} → ${login}, write access to ${slug}${shadowed}`);
  return true;
}

module.exports = { preflightGitHubToken };

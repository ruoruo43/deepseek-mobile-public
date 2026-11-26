import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGitHubUpdateResult } from '../src/services/githubUpdates.ts'

test('links a newer stable version to its matching repository release', () => {
  assert.deepEqual(
    parseGitHubUpdateResult('0.1.1', {
      status: 'release',
      tag: 'v0.1.2',
      html_url: 'https://example.invalid/v0.1.2',
    }),
    {
      status: 'available',
      tag: 'v0.1.2',
      url: 'https://github.com/ruoruo43/deepseek-mobile-public/releases/tag/v0.1.2',
    }
  )
})

test('reports the same release as current with either installed version format', () => {
  for (const installedVersion of ['0.1.1', 'v0.1.1']) {
    assert.deepEqual(
      parseGitHubUpdateResult(installedVersion, { status: 'release', tag: 'v0.1.1' }),
      {
        status: 'current',
        tag: 'v0.1.1',
      }
    )
  }
})

test('reports no update when the installed version is ahead', () => {
  assert.deepEqual(parseGitHubUpdateResult('1.0.0', { status: 'release', tag: 'v0.99.99' }), {
    status: 'current',
    tag: 'v0.99.99',
  })
})

test('compares version components numerically without rounding', () => {
  assert.equal(
    parseGitHubUpdateResult('0.9.4', { status: 'release', tag: 'v0.10.0' }).status,
    'available'
  )
  assert.equal(
    parseGitHubUpdateResult('1.0.9007199254740992', {
      status: 'release',
      tag: 'v1.0.9007199254740993',
    }).status,
    'available'
  )
})

test('rejects malformed or nonstable release tags', () => {
  for (const tag of [null, '1.2.3', 'v1.2', 'v1.2.3-rc.1', 'v1.02.3', 'v1.2.3\n', 'v1.2.3/extra']) {
    assert.deepEqual(parseGitHubUpdateResult('0.1.1', { status: 'release', tag }), {
      status: 'invalidRelease',
    })
  }
})

test('requires a recognized installed version before suggesting an update', () => {
  for (const installedVersion of [null, '1.0.0-dev']) {
    assert.deepEqual(
      parseGitHubUpdateResult(installedVersion, { status: 'release', tag: 'v1.1.0' }),
      {
        status: 'invalidInstalledVersion',
      }
    )
  }
})

test('interprets public release errors without exposing response content', () => {
  for (const status of [
    'rateLimited',
    'notFound',
    'timeout',
    'networkError',
    'unavailable',
    'busy',
  ]) {
    assert.deepEqual(parseGitHubUpdateResult('0.1.1', { status, body: 'server response' }), {
      status,
    })
  }
})

test('rejects unexpected and obsolete credential statuses', () => {
  for (const status of [
    'unexpected',
    'tokenRequired',
    'storageError',
    'unauthorized',
    'forbidden',
  ]) {
    assert.deepEqual(parseGitHubUpdateResult('0.1.1', { status }), { status: 'invalidRelease' })
  }
})

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

let runsDir: string;

beforeEach(async () => {
  runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  config.runsDir = runsDir;
});

afterEach(async () => {
  await rm(runsDir, { recursive: true, force: true });
});

async function writeNight(night: string, contents: string) {
  await writeFile(join(runsDir, `${night}.jsonl`), contents, 'utf8');
}

describe('digest routes', () => {
  it('renders HTML and JSON from the same sorted rows, preserving edge-case data', async () => {
    await writeNight(
      '2026-10-30',
      [
        JSON.stringify({ at: '2026-10-30T01:15:00+05:30', job: 'zulu', status: 'retry', owner: null, error: '<script>alert("x")</script>' }),
        JSON.stringify({ at: '2026-10-30T01:20:00+05:30', job: 'zulu', status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-30T01:25:00+05:30', job: 'zulu', status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-30T01:30:00+05:30', job: 'zulu', status: 'ok', owner: null }),
        'this is not json',
        JSON.stringify({ at: '2026-10-30T02:04:00-04:00', job: 'alpha', status: 'fail', owner: 'ops', error: '<img src=x onerror=alert(1)>' }),
      ].join('\n'),
    );

    const app = createApp({ ...config });
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-30'),
      app.request('/api/digest/2026-10-30'),
    ]);
    const html = await htmlResponse.text();
    const digest = (await jsonResponse.json()) as DigestNight;

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(digest.night).toBe('2026-10-30');
    expect(digest.badLines).toBe(1);
    expect(digest.rows.map((row) => row.job)).toEqual(['alpha', 'zulu']);
    expect(digest.rows[0]).toMatchObject({
      job: 'alpha',
      lastStatus: 'fail',
      firstAt: '2026-10-30T02:04:00-04:00',
      lastAt: '2026-10-30T02:04:00-04:00',
    });
    expect(digest.rows[1]).toMatchObject({
      job: 'zulu',
      owner: null,
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      firstAt: '2026-10-30T01:15:00+05:30',
      lastAt: '2026-10-30T01:30:00+05:30',
    });

    // Both routes use the same digest result, including job order and the invalid-line count.
    const htmlAlpha = html.indexOf('<td>alpha</td>');
    const htmlZulu = html.indexOf('<td>zulu</td>');
    expect(htmlAlpha).toBeGreaterThan(-1);
    expect(htmlZulu).toBeGreaterThan(htmlAlpha);
    expect(html).toContain('bad lines: 1');
    expect(html).toContain('<td>—</td>');

    // Retries >= 3 and failed jobs are visibly marked, and user-controlled strings stay escaped.
    expect(html).toMatch(/<td class="warn">fail<\/td>/);
    expect(html).toMatch(/<td class="warn">3<\/td>/);
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('returns 404 for a night that has no file', async () => {
    const app = createApp({ ...config });
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-31'),
      app.request('/api/digest/2026-10-31'),
    ]);

    expect(htmlResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
    expect(await jsonResponse.json()).toEqual({ error: 'not found' });
  });

  it('renders an empty night as nothing ran', async () => {
    await writeNight('2026-11-01', '');
    const app = createApp({ ...config });
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-11-01'),
      app.request('/api/digest/2026-11-01'),
    ]);
    const html = await htmlResponse.text();
    const digest = (await jsonResponse.json()) as DigestNight;

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(digest).toMatchObject({ night: '2026-11-01', rows: [], badLines: 0 });
  });
});

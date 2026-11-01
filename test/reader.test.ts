import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const event = { at: '2026-10-28T23:00:00+01:00', job: 'job', status: 'ok', owner: 'rook' };
const directories: string[] = [];

function fixture(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  directories.push(directory);
  writeFileSync(join(directory, `${night}.jsonl`), contents);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads the real fixture without modifying it', () => {
    const digest = readNight(fileURLToPath(new URL('../runs/', import.meta.url)), night);
    expect(digest?.badLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest?.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0].owner).toBeNull();
    expect(digest?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok',
      lastError: 'upstream 503', firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(digest?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held' });
    expect(digest?.rows[3]).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('orders events by instant and preserves offsets, latest owner, and last observed error', () => {
    const directory = fixture([
      { ...event, at: '2026-10-29T01:00:00+01:00', owner: null },
      { ...event, at: '2026-10-29T01:30:00+02:00', status: 'retry', error: 'latest error' },
      { ...event, at: '2026-10-28T23:00:00Z', status: 'fail', error: 'first error' },
    ].map(value => JSON.stringify(value)).join('\n'));
    expect(readNight(directory, night)).toEqual({
      night, badLines: 0, counts: { ok: 1, retry: 1, fail: 1 },
      rows: [{ job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'latest error',
        firstAt: '2026-10-28T23:00:00Z', lastAt: '2026-10-29T01:00:00+01:00' }],
    });
  });

  it('uses file order for equal timestamps and retains an empty error string', () => {
    const directory = fixture([
      { ...event, status: 'retry', error: 'error' },
      { ...event, owner: null, error: '' },
    ].map(value => JSON.stringify(value)).join('\n'));
    expect(readNight(directory, night)?.rows[0]).toMatchObject({ owner: null, runs: 2, retries: 1, lastStatus: 'ok', lastError: '' });
  });

  it('counts malformed JSON and invalid event fields while ignoring blank lines', () => {
    const invalid: unknown[] = [
      null, [], 42, {},
      { ...event, at: 'yesterday' },
      { ...event, at: '2026-02-30T23:00:00Z' },
      { ...event, at: '2026-10-28T24:00:00Z' },
      { ...event, at: '2026-10-28T23:00:00' },
      { ...event, at: '2026-10-28T23:00:00+24:00' },
      { ...event, job: '  ' }, { ...event, job: 42 },
      { ...event, status: 'unknown' }, { ...event, owner: undefined },
      { ...event, owner: 42 }, { ...event, error: null }, { ...event, error: {} },
    ];
    const directory = fixture(['', '  ', '{broken', ...invalid.map(value => JSON.stringify(value)), JSON.stringify(event), ''].join('\r\n'));
    expect(readNight(directory, night)).toMatchObject({ badLines: invalid.length + 1, counts: { ok: 1, retry: 0, fail: 0 } });
    expect(readNight(directory, night)?.rows).toHaveLength(1);
  });

  it('renders an empty or blank night as an empty digest', () => {
    for (const contents of ['', '\n \t\r\n']) {
      expect(readNight(fixture(contents), night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    }
  });

  it('rejects invalid calendar dates and paths and returns null for missing files', () => {
    const directory = fixture('');
    for (const invalid of ['../2026-10-28', '/2026-10-28', '2026-2-03', '2026-02-29', '2026-04-31', '2026-00-01', '2026-10-00', '2026-10-28\n']) {
      expect(readNight(directory, invalid)).toBeNull();
    }
    expect(readNight(directory, '2026-10-29')).toBeNull();
    writeFileSync(join(directory, '2024-02-29.jsonl'), JSON.stringify({ ...event, at: '2024-02-29T23:00:00.123Z' }));
    expect(readNight(directory, '2024-02-29')?.rows).toHaveLength(1);
  });

  it('does not hide filesystem failures other than a missing file', () => {
    const directory = fixture('');
    expect(() => readNight(join(directory, `${night}.jsonl`), night)).toThrow();
  });
});

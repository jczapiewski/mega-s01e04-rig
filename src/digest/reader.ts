import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, DigestStatus, ReadNight } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function validDate(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function validTimestamp(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || match[0] !== value || !validDate(match[1])) return false;
  return Number(match[2]) <= 23 && Number(match[3]) <= 59 && Number(match[4]) <= 59
    && (match[5] === 'Z' || (Number(match[6]) <= 23 && Number(match[7]) <= 59))
    && Number.isFinite(Date.parse(value));
}

function isEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return typeof event.at === 'string' && validTimestamp(event.at)
    && typeof event.job === 'string' && event.job.trim().length > 0
    && (event.status === 'ok' || event.status === 'retry' || event.status === 'fail')
    && (event.owner === null || typeof event.owner === 'string')
    && (event.error === undefined || typeof event.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!validDate(night)) return null;
  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const digest: DigestNight = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const events: RunEvent[] = [];
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      digest.badLines++;
      continue;
    }
    if (!isEvent(value)) {
      digest.badLines++;
      continue;
    }
    events.push(value);
    digest.counts[value.status]++;
  }

  // Stable sorting keeps file order for events recorded at the same instant.
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const jobs = new Map<string, DigestRow>();
  for (const event of events) {
    const previous = jobs.get(event.job);
    jobs.set(event.job, {
      job: event.job,
      owner: event.owner,
      runs: (previous?.runs ?? 0) + 1,
      retries: (previous?.retries ?? 0) + Number(event.status === 'retry'),
      lastStatus: event.status,
      lastError: event.error ?? previous?.lastError ?? null,
      firstAt: previous?.firstAt ?? event.at,
      lastAt: event.at,
    });
  }
  digest.rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
};

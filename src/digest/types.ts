export type DigestStatus = 'ok' | 'retry' | 'fail';

/** One job's valid events, aggregated in chronological order. */
export type DigestRow = {
  job: string;
  /** Owner from the latest event, including an explicitly missing owner. */
  owner: string | null;
  /** Total valid events for this job, regardless of status. */
  runs: number;
  /** Number of valid events with status retry. */
  retries: number;
  lastStatus: DigestStatus;
  /** Last error observed; a later event without an error does not erase it. */
  lastError: string | null;
  /** Earliest event timestamp, retaining its original offset from the log. */
  firstAt: string;
  /** Latest event timestamp, retaining its original offset from the log. */
  lastAt: string;
};

export type DigestNight = {
  /** Calendar date in YYYY-MM-DD form. */
  night: string;
  /** One row per job, sorted by job name. */
  rows: DigestRow[];
  /** Nonblank lines rejected because their JSON or event fields are invalid. */
  badLines: number;
  /** Raw valid event counts, not counts of each job's final status. */
  counts: { ok: number; retry: number; fail: number };
};

/**
 * Synchronously reads runsDir/<night>.jsonl. Returns null for an invalid night
 * or a missing file. An empty file returns an empty digest. Implemented by
 * readNight in src/digest/reader.ts.
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;

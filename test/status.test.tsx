import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('ok 10 · retry 4 · fail 1');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('ok 7 · retry 0 · fail 0');

    for (const night of ['2026-10-28', '2026-10-27']) {
      const digest = await createApp(config).request(`/digest/${night}`);
      expect(digest.status).toBe(200);
      expect(await digest.text()).toContain(`digest · ${night}`);
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});

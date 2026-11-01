import type { DigestNight, DigestRow } from '../digest/types.js';

function display(value: string | null) {
  return value ?? '—';
}

function statusClass(row: DigestRow) {
  return row.retries >= 3 || row.lastStatus === 'fail' ? 'warn' : undefined;
}

export function DigestPage({ digest }: { digest: DigestNight }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      <p>bad lines: {digest.badLines}</p>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first time</th>
              <th>last time</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{display(row.owner)}</td>
                <td>{row.runs}</td>
                <td class={row.retries >= 3 ? 'warn' : undefined}>{row.retries}</td>
                <td class={statusClass(row)}>{row.lastStatus}</td>
                <td>{display(row.lastError)}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

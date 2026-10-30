import { useEffect, useRef, useState } from 'react';

import { ApiError, openStream } from '../api';
import type { Resource } from '../api';
import type { Principal, StreamFrame } from '../types';
import { ProblemView } from './Problem';

/**
 * Live SSE panel for one entity.
 *
 * `Last-Event-ID: 0` means "replay the whole retained stream" — the off-by-one
 * that the spike's own NOTES.md records as a defect it caught. Leaving the box
 * empty instead starts from the current cursor, so you can watch the two
 * behave differently.
 */
export function EventStream({
  resource,
  principal,
  id,
  label,
}: {
  resource: Resource;
  principal: Principal;
  id: string | null;
  label: string;
}): React.ReactElement {
  const [frames, setFrames] = useState<StreamFrame[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [replayFrom, setReplayFrom] = useState('0');
  const [live, setLive] = useState(false);
  const closeRef = useRef<(() => void) | null>(null);

  // Drop the stream whenever the subject or the principal changes: a stream
  // authorized for one principal must never keep feeding another.
  useEffect(() => {
    return () => {
      closeRef.current?.();
      closeRef.current = null;
    };
  }, [id, principal.tenantId, principal.role, principal.customerId]);

  function start(): void {
    if (id === null) return;
    closeRef.current?.();
    setFrames([]);
    setError(null);
    closeRef.current = openStream(
      resource,
      principal,
      id,
      replayFrom.trim() === '' ? null : replayFrom.trim(),
      (frame) => setFrames((current) => [...current, frame]),
      (failure) => {
        setError(failure);
        setLive(false);
      },
    );
    setLive(true);
  }

  function stop(): void {
    closeRef.current?.();
    closeRef.current = null;
    setLive(false);
  }

  return (
    <div className="card">
      <h3>Event stream — {label}</h3>
      <div className="row">
        <div className="col">
          <label>Last-Event-ID</label>
          <input
            style={{ width: 90 }}
            value={replayFrom}
            onChange={(event) => setReplayFrom(event.target.value)}
            placeholder="(none)"
          />
        </div>
        <button onClick={start} disabled={id === null || live}>
          {live ? 'streaming…' : 'open stream'}
        </button>
        <button onClick={stop} disabled={!live}>
          close
        </button>
      </div>
      <p className="hint">
        <code>0</code> replays everything retained; empty starts at the current cursor.
      </p>

      <ProblemView error={error} />

      <div className="stream">
        {frames.length === 0 ? (
          <p className="empty">{live ? 'open — waiting for frames' : 'not streaming'}</p>
        ) : (
          frames.map((frame, index) => (
            <div className="frame" key={`${frame.id}-${index}`}>
              <div className="head">
                id {frame.id} · {frame.event}
              </div>
              <pre>{JSON.stringify(frame.data, null, 1)}</pre>
            </div>
          ))
        )}
      </div>
      {frames.length > 0 && (
        <p className="hint">
          {frames.length} frame{frames.length === 1 ? '' : 's'} · heartbeat comments are not shown,
          which is what makes them invisible to a client
        </p>
      )}
    </div>
  );
}

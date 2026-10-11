// A renderer visit is a session; thirty minutes without a recorded action starts another.
// Each window has its own state, so presentation and operator windows do not interleave.
export const WORKFLOW_EVENTS = new Set(['show_loaded', 'song_selected', 'block_navigated', 'window_opened', 'presentation_opened']);
const IDLE_MS = 30 * 60 * 1000;
type Session = { id: string; device: string; last: number; sequence: number; previous?: string };

export function metricId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // randomUUID needs a secure context; getRandomValues also works on local HTTP installations.
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createMetricSession(now = () => Date.now(), makeId = metricId) {
  let session: Session | undefined;
  return (event: string, device: string): Record<string, unknown> => {
    const time = now();
    if (!session || session.device !== device || time < session.last || time - session.last >= IDLE_MS || event === 'login') {
      session = { id: makeId(), device, last: time, sequence: 0 };
    }
    session.last = time;
    session.sequence++;
    const context: Record<string, unknown> = {
      session_id: session.id,
      session_sequence: session.sequence,
      occurred_at: new Date(time).toISOString(),
    };
    if (WORKFLOW_EVENTS.has(event)) {
      if (session.previous) context.workflow_previous = session.previous;
      session.previous = event;
    }
    return context;
  };
}

export const metricSessionContext = createMetricSession();

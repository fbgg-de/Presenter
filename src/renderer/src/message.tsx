/**
 * /message — ask the operator to put up a message, from a phone: the nursery worker's "Kind 12
 * bitte abholen" without anyone typing it at the presenter desk (ProPresenter's remote message
 * page). Lists the account's message overlays; one with `{fields}` asks for their values.
 *
 * Nothing reaches the screens from here: the request travels over the relay (`message_request`,
 * relay ticket auth), waits as a chip in the operator's top bar, and comes back as
 * `message_request_ack` once the operator showed or dismissed it.
 *
 * Like /control: no Redux, no MUI, no i18n bundle — a few kilobytes on a phone.
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { mountRoot } from './mountRoot';
import { sendRelayAuth } from './utils/relayTicket';
import { fillTemplate, templateFields, type StageLayerEntity, type StageMessageCue } from './stage/types';
import { newId } from './utils/ids';

const DE = (navigator.language || '').toLowerCase().startsWith('de');
const T = DE
  ? {
      title: 'Meldung anfragen',
      none: 'Es gibt noch keine Meldungen. Lege im Presenter unter „Overlays“ eine Ebene mit einer Meldung an, z. B. „Kind {Nummer} bitte abholen“.',
      send: 'An die Technik senden',
      waiting: 'Gesendet – wartet auf die Technik …',
      shown: 'Wird auf den Bildschirmen gezeigt.',
      dismissed: 'Die Technik hat die Meldung nicht gezeigt.',
      offline: 'Keine Verbindung zum Presenter …',
      noRelay: 'Für dieses Konto ist kein Relay eingerichtet.',
      back: 'Andere Meldung',
    }
  : {
      title: 'Request a message',
      none: 'There are no messages yet. In Presenter, add an overlay layer with a message, e.g. "Child {number} please come to the nursery".',
      send: 'Send to the operator',
      waiting: 'Sent — waiting for the operator…',
      shown: 'Shown on the screens.',
      dismissed: 'The operator did not show the message.',
      offline: 'Not connected to Presenter…',
      noRelay: 'No relay is set up for this account.',
      back: 'Another message',
    };

const C = {
  bg: '#0F1214',
  panel: '#161616',
  border: 'rgba(255,255,255,0.12)',
  text: '#fff',
  dim: 'rgba(255,255,255,0.6)',
  red: '#C44D58',
  ok: '#66bb6a',
};

interface Session {
  isAuthenticated?: boolean;
  account?: number;
  name?: string;
  settings?: { wsHost?: { host?: string; port?: number; path?: string; wss?: boolean } };
}

type Choice = { layer: StageLayerEntity; cue: StageMessageCue };

const MessageApp = () => {
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [picked, setPicked] = useState<Choice | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ id: string; state: 'waiting' | 'shown' | 'dismissed' } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const nameRef = useRef('');

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = (url: string, account: number) => {
      if (stopped) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => sendRelayAuth(ws, '', account, { role: 'remote', name: nameRef.current || undefined });
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type?: string; action?: string; data?: { id?: string; status?: string } };
          if (msg.type === 'auth_ok') setConnected(true);
          if (msg.action === 'message_request_ack' && msg.data?.id) {
            const { id, status: answer } = msg.data;
            setStatus((s) => (s && s.id === id ? { id, state: answer === 'shown' ? 'shown' : 'dismissed' } : s));
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) timer = setTimeout(() => connect(url, account), 4000);
      };
    };

    void (async () => {
      const session = (await fetch('/rest/Session').then((r) => r.json())) as Session;
      if (!session?.isAuthenticated) {
        window.location.replace('/login?next=' + encodeURIComponent('/message'));
        return;
      }
      nameRef.current = session.name ?? '';
      const layers = (await fetch('/rest/StageLayers').then((r) => (r.ok ? r.json() : []))) as StageLayerEntity[];
      setChoices(
        layers
          .filter((layer) => layer.enabled)
          .flatMap((layer) =>
            (layer.data?.cues ?? [])
              .filter((cue): cue is StageMessageCue => cue.kind === 'message' && !!cue.text.trim())
              .map((cue) => ({ layer, cue })),
          ),
      );
      const h = session.settings?.wsHost;
      if (typeof session.account !== 'number' || !h?.host || !h?.port) {
        setError(T.noRelay);
        return;
      }
      const path = h.path && h.path !== '/' ? h.path : '';
      connect(`${h.wss ? 'wss' : 'ws'}://${h.host}:${h.port}${path}`, session.account);
    })().catch(() => setError(T.offline));

    return () => {
      stopped = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  const send = () => {
    const ws = wsRef.current;
    if (!picked || !ws || ws.readyState !== WebSocket.OPEN) return;
    const id = newId('msg');
    ws.send(
      JSON.stringify({
        type: 'broadcast',
        action: 'message_request',
        data: { id, layerId: picked.layer.id, cueId: picked.cue.id, fields: values, from: nameRef.current || undefined },
      }),
    );
    setStatus({ id, state: 'waiting' });
  };

  const fields = picked ? templateFields(picked.cue.text) : [];
  const card = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 } as const;
  const button = (primary: boolean) =>
    ({
      width: '100%',
      padding: '14px 16px',
      borderRadius: 10,
      border: primary ? 'none' : `1px solid ${C.border}`,
      background: primary ? C.red : 'transparent',
      color: C.text,
      fontSize: 17,
      fontWeight: 600,
    }) as const;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        color: C.text,
        fontFamily: 'Roboto, system-ui, sans-serif',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: connected ? C.ok : '#f5a623' }} />
        <h1 style={{ fontSize: 20, margin: 0 }}>{T.title}</h1>
      </div>
      {error && <p style={{ color: C.dim }}>{error}</p>}
      {!error && !connected && choices && <p style={{ color: C.dim }}>{T.offline}</p>}
      {choices && choices.length === 0 && <p style={{ color: C.dim }}>{T.none}</p>}

      {!picked &&
        choices?.map((choice) => (
          <button
            key={`${choice.layer.id}:${choice.cue.id}`}
            onClick={() => {
              setPicked(choice);
              setValues({});
              setStatus(null);
            }}
            style={{ ...card, display: 'block', width: '100%', textAlign: 'left', color: C.text, marginBottom: 10 }}
          >
            <div style={{ fontSize: 12, color: C.dim }}>{choice.layer.name}</div>
            <div style={{ fontSize: 17, marginTop: 4 }}>{choice.cue.text}</div>
          </button>
        ))}

      {picked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map((name, i) => (
            <label key={name} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: C.dim }}>
              {name}
              <input
                autoFocus={i === 0}
                value={values[name] ?? ''}
                disabled={status?.state === 'waiting'}
                onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                style={{ fontSize: 22, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel, color: C.text }}
              />
            </label>
          ))}
          <div style={card}>{fillTemplate(picked.cue.text, values)}</div>
          {status ? (
            <p style={{ color: status.state === 'shown' ? C.ok : C.dim, fontSize: 16 }}>{T[status.state]}</p>
          ) : (
            <button onClick={send} disabled={!connected || fields.some((f) => !values[f]?.trim())} style={button(true)}>
              {T.send}
            </button>
          )}
          <button onClick={() => setPicked(null)} style={button(false)}>
            {T.back}
          </button>
        </div>
      )}
    </div>
  );
};

mountRoot(
  <StrictMode>
    <MessageApp />
  </StrictMode>,
);

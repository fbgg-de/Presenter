/**
 * Web MIDI API hook for musician PDF view (§11.10).
 * Handles MIDI device detection, MIDI Learn mapping, auto-reconnect,
 * and dispatching navigation actions from MIDI events.
 *
 * Mappings are device-independent: the same MIDI key (e.g. "cc_64", "note_60")
 * from ANY connected device will trigger its mapped action.
 * Multiple distinct keys can each map to different actions simultaneously.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppDispatch } from '@/store';
import { useUpdateMusicianSetting, useGetMusicianSettings } from '@/store/musicianSlice';

export type MidiAction =
  | 'next_page'
  | 'prev_page'
  | 'next_song'
  | 'prev_song'
  | 'next_block'
  | 'prev_block'
  | 'toggle_tracking'
  /** Blanks the presentation output. Acts on the operator, relayed as a `remote_command`. */
  | 'toggle_black';

export type MidiStatus = 'disconnected' | 'connected' | 'scanning' | 'unsupported';

interface MidiDevice {
  id: string;
  name: string;
  connected: boolean;
}

interface UseMidiOptions {
  onAction?: (action: MidiAction) => void;
  enabled?: boolean;
}

/**
 * Build a device-independent MIDI message key from a MIDI event.
 * Format: "note_60", "cc_64", "pc_5", "msg_0xe0_0"
 */
const midiMessageKey = (data: Uint8Array): string | null => {
  if (data.length < 2) return null;
  const status = data[0] & 0xf0;
  const value = data[1];
  switch (status) {
    case 0x90: // Note On
      return `note_${value}`;
    case 0xb0: // Control Change
      return `cc_${value}`;
    case 0xc0: // Program Change
      return `pc_${value}`;
    default:
      return `msg_${data[0]}_${value}`;
  }
};

export const useMidi = ({ onAction, enabled = true }: UseMidiOptions) => {
  const dispatch = useAppDispatch();

  const { midiMappings } = useGetMusicianSettings();
  const updateSetting = useUpdateMusicianSetting();

  const [status, setStatus] = useState<MidiStatus>('disconnected');
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [learnAction, setLearnAction] = useState<MidiAction | null>(null);

  const accessRef = useRef<MIDIAccess | null>(null);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  // Keep refs up-to-date so the stable handler always reads latest values
  const midiMappingsRef = useRef(midiMappings);
  midiMappingsRef.current = midiMappings;
  const learnActionRef = useRef(learnAction);
  learnActionRef.current = learnAction;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // Check support
  const isSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

  // Stable handler — reads everything from refs, never needs to be recreated
  const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
    if (!event.data || event.data.length < 2) return;
    // Ignore Note Off (velocity 0 or status 0x80)
    const statusByte = event.data[0] & 0xf0;
    if (statusByte === 0x80) return;
    if (statusByte === 0x90 && event.data.length >= 3 && event.data[2] === 0) return;

    const key = midiMessageKey(event.data);
    if (!key) return;

    // MIDI Learn: map this key to the target action
    const currentLearnAction = learnActionRef.current;
    if (currentLearnAction) {
      const newMappings = { ...midiMappingsRef.current, [key]: currentLearnAction };
      updateSetting('midiMappings', newMappings);
      setLearnAction(null);
      return;
    }

    // Look up and fire the mapped action
    const action = midiMappingsRef.current[key] as MidiAction | undefined;
    if (action) onActionRef.current?.(action);
  }, []); // stable — no deps, reads via refs

  // Connect to MIDI devices — only re-runs when enabled changes, not on every mapping change
  useEffect(() => {
    if (!enabled || !isSupported) {
      setStatus(isSupported ? 'disconnected' : 'unsupported');
      return;
    }

    let cancelled = false;

    const connectMidi = async () => {
      setStatus('scanning');
      try {
        const access = await navigator.requestMIDIAccess({ sysex: false });
        if (cancelled) return;
        accessRef.current = access;

        const updateDevices = () => {
          const devs: MidiDevice[] = [];
          access.inputs.forEach((input) => {
            devs.push({
              id: input.id,
              name: input.name || `MIDI ${input.id}`,
              connected: input.state === 'connected',
            });
          });
          setDevices(devs);
          setStatus(devs.some((d) => d.connected) ? 'connected' : 'disconnected');
        };

        const attachHandlers = () => {
          access.inputs.forEach((input) => {
            input.onmidimessage = handleMidiMessage;
          });
        };

        access.onstatechange = () => {
          updateDevices();
          attachHandlers();
        };

        updateDevices();
        attachHandlers();
      } catch (err) {
        console.warn('[MIDI] Failed to access MIDI devices:', err);
        if (!cancelled) setStatus('disconnected');
      }
    };

    connectMidi();

    return () => {
      cancelled = true;
      if (accessRef.current) {
        accessRef.current.inputs.forEach((input) => {
          input.onmidimessage = null;
        });
      }
    };
  }, [enabled, isSupported, handleMidiMessage]);

  const startLearn = useCallback((action: MidiAction) => {
    setLearnAction(action);
  }, []);

  const cancelLearn = useCallback(() => {
    setLearnAction(null);
  }, []);

  /** Remove a single key→action mapping */
  const removeMapping = useCallback((midiKey: string) => {
    const newMappings = { ...midiMappingsRef.current };
    delete newMappings[midiKey];
    updateSetting('midiMappings', newMappings);
  }, []);

  /** Clear all mappings for a specific action */
  const clearActionMappings = useCallback((action: MidiAction) => {
    const newMappings = { ...midiMappingsRef.current };
    Object.keys(newMappings).forEach((k) => {
      if (newMappings[k] === action) delete newMappings[k];
    });
    updateSetting('midiMappings', newMappings);
  }, []);

  return {
    status,
    devices,
    isSupported,
    isLearning: learnAction !== null,
    learnAction,
    startLearn,
    cancelLearn,
    removeMapping,
    clearActionMappings,
    midiMappings,
  };
};

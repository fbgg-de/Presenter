/**
 * Web MIDI API hook for musician PDF view (§11.10).
 * Handles MIDI device detection, MIDI Learn mapping, auto-reconnect,
 * and dispatching navigation actions from MIDI events.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/store';
import { updateSetting } from '@/store/settingsSlice';

export type MidiAction = 'next_page' | 'prev_page' | 'next_song' | 'prev_song' | 'next_block' | 'prev_block' | 'toggle_tracking';

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
 * Build a MIDI message key from a MIDI event (e.g., "note_60", "cc_64").
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
  const midiMappings = useAppSelector((s) => s.settings.midiMappings);
  const [status, setStatus] = useState<MidiStatus>('disconnected');
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [learnAction, setLearnAction] = useState<MidiAction | null>(null);
  const [learnDeviceName, setLearnDeviceName] = useState<string>('');

  const accessRef = useRef<MIDIAccess | null>(null);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  // Check support
  const isSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

  // Handle incoming MIDI message
  const handleMidiMessage = useCallback(
    (deviceName: string, event: MIDIMessageEvent) => {
      if (!event.data || event.data.length < 2) return;
      const key = midiMessageKey(event.data);
      if (!key) return;

      // If in learn mode, map this message to the target action
      if (learnAction && (learnDeviceName === '' || learnDeviceName === deviceName)) {
        const newMappings = { ...midiMappings };
        if (!newMappings[deviceName]) {
          newMappings[deviceName] = {};
        }
        newMappings[deviceName] = { ...newMappings[deviceName], [key]: learnAction };
        dispatch(updateSetting({ key: 'midiMappings', value: newMappings }));
        setLearnAction(null);
        setLearnDeviceName('');
        return;
      }

      // Look up the mapping for this device
      const deviceMap = midiMappings[deviceName];
      if (deviceMap && deviceMap[key]) {
        const action = deviceMap[key] as MidiAction;
        onActionRef.current?.(action);
      }
    },
    [learnAction, learnDeviceName, midiMappings, dispatch],
  );

  // Connect to MIDI devices
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

        // Attach message handlers
        const attachHandlers = () => {
          access.inputs.forEach((input) => {
            const deviceName = input.name || `MIDI ${input.id}`;
            input.onmidimessage = (event) => handleMidiMessage(deviceName, event);
          });
        };

        // Handle device connect/disconnect (auto-reconnect)
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

  // Start MIDI learn for a specific action
  const startLearn = useCallback((action: MidiAction, deviceName?: string) => {
    setLearnAction(action);
    setLearnDeviceName(deviceName || '');
  }, []);

  // Cancel MIDI learn
  const cancelLearn = useCallback(() => {
    setLearnAction(null);
    setLearnDeviceName('');
  }, []);

  // Clear mapping for a device
  const clearMapping = useCallback(
    (deviceName: string) => {
      const newMappings = { ...midiMappings };
      delete newMappings[deviceName];
      dispatch(updateSetting({ key: 'midiMappings', value: newMappings }));
    },
    [midiMappings, dispatch],
  );

  // Remove a single mapping entry
  const removeMapping = useCallback(
    (deviceName: string, midiKey: string) => {
      const newMappings = { ...midiMappings };
      if (newMappings[deviceName]) {
        const deviceMap = { ...newMappings[deviceName] };
        delete deviceMap[midiKey];
        newMappings[deviceName] = deviceMap;
        dispatch(updateSetting({ key: 'midiMappings', value: newMappings }));
      }
    },
    [midiMappings, dispatch],
  );

  return {
    status,
    devices,
    isSupported,
    isLearning: learnAction !== null,
    learnAction,
    startLearn,
    cancelLearn,
    clearMapping,
    removeMapping,
    midiMappings,
  };
};

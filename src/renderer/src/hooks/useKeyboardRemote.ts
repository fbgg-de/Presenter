/**
 * Keyboard remote-control hook for the musician page — the keyboard counterpart of useMidi.
 * Maps key combos to the same navigation actions; multiple combos can map to different
 * actions simultaneously, alongside MIDI mappings.
 *
 * Combo format matches the operator keyboard mapping (KeyboardMappingEditor):
 * modifiers + `e.code`, e.g. "PageDown", "Ctrl+ArrowRight", "Shift+KeyN".
 *
 * The musician page owns the single instance (listeners are addEventListener-based, so a
 * second instance would double-fire); the RemoteControlDialog receives it via prop.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUpdateMusicianSetting, useGetMusicianSettings } from '@/store/musicianSlice';
import type { MidiAction } from '@/hooks/useMidi';

const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

/** Build a combo string from a keydown event; null for bare modifier presses. */
const comboFromEvent = (e: KeyboardEvent): string | null => {
  if (MODIFIER_CODES.has(e.code)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  parts.push(e.code);
  return parts.join('+');
};

/** True when the event originates from a text-entry element — never treat those as remote input. */
const isTypingTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

interface UseKeyboardRemoteOptions {
  onAction?: (action: MidiAction) => void;
  enabled?: boolean;
}

export const useKeyboardRemote = ({ onAction, enabled = true }: UseKeyboardRemoteOptions) => {
  const { musicianKeyboardMappings } = useGetMusicianSettings();
  const updateSetting = useUpdateMusicianSetting();

  const [learnAction, setLearnAction] = useState<MidiAction | null>(null);

  // Keep refs up-to-date so the stable handler always reads latest values
  const mappingsRef = useRef(musicianKeyboardMappings);
  mappingsRef.current = musicianKeyboardMappings;
  const learnRef = useRef(learnAction);
  learnRef.current = learnAction;
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const updateSettingRef = useRef(updateSetting);
  updateSettingRef.current = updateSetting;

  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e.target)) return;

      // Learn mode: capture the next combo (Escape cancels)
      if (learnRef.current) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
          setLearnAction(null);
          return;
        }
        const combo = comboFromEvent(e);
        if (!combo) return; // bare modifier — wait for a full combo
        updateSettingRef.current('musicianKeyboardMappings', { ...mappingsRef.current, [combo]: learnRef.current });
        setLearnAction(null);
        return;
      }

      const combo = comboFromEvent(e);
      if (!combo) return;
      const action = mappingsRef.current[combo];
      if (action) {
        e.preventDefault();
        onActionRef.current?.(action);
      }
    };

    // Capture phase so mapped keys win over other page-level key handlers.
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [enabled]);

  const startLearn = useCallback((action: MidiAction) => setLearnAction(action), []);
  const cancelLearn = useCallback(() => setLearnAction(null), []);

  /** Remove a single combo→action mapping */
  const removeMapping = useCallback((combo: string) => {
    const next = { ...mappingsRef.current };
    delete next[combo];
    updateSettingRef.current('musicianKeyboardMappings', next);
  }, []);

  return {
    isLearning: learnAction !== null,
    learnAction,
    startLearn,
    cancelLearn,
    removeMapping,
    keyboardMappings: musicianKeyboardMappings,
  };
};

export type KeyboardRemote = ReturnType<typeof useKeyboardRemote>;

/**
 * Command ids a mobile remote-control client (/control page) can trigger on the
 * operator. Shared between the Settings permission UI, the operator-side handler
 * (usePresentationSync) and the allowed-list broadcast to control clients.
 */
export const REMOTE_COMMAND_IDS = [
  'prev_block',
  'next_block',
  'prev_item',
  'next_item',
  'toggle_text',
  'toggle_video',
  'toggle_video_playback',
  'toggle_black',
] as const;

export type RemoteCommandId = (typeof REMOTE_COMMAND_IDS)[number];

/** Missing key = allowed; only an explicit `false` denies a command. */
export const isRemoteCommandAllowed = (allowed: Record<string, boolean> | undefined, command: string): boolean =>
  allowed?.[command] !== false;

/** The list of currently allowed command ids (for broadcasting to control clients). */
export const allowedRemoteCommands = (allowed: Record<string, boolean> | undefined): string[] =>
  REMOTE_COMMAND_IDS.filter((id) => isRemoteCommandAllowed(allowed, id));

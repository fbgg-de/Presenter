import { alpha } from '@mui/material/styles';
import { keyframes } from '@emotion/react';

/**
 * A hold that is holding the video, or a loop that is repeating, changes what the video does next —
 * so its chip pulses between its fill and a brighter one until it lets go.
 */
const pulse = (tint: string) => keyframes`
  0%, 100% { background-color: ${alpha(tint, 0.45)}; box-shadow: 0 0 0 0 ${alpha(tint, 0)}; }
  50% { background-color: ${alpha(tint, 0.85)}; box-shadow: 0 0 8px 1px ${alpha(tint, 0.65)}; }
`;

/**
 * The look of every chip that can be armed — a video's regions (`CueRegions`), a document's pages
 * in the layer bar's slides row and under its cards. Armed is filled, with a solid border and its
 * icon lit; disarmed is empty, dashed and grey, so the difference reads at a glance. What holds the
 * clock right now gets a heavier fill and a 2px border of the *same* hue; queued is dotted.
 */
export const armableChipSx = (
  tint: string,
  { off, held, next, pulse: pulsing }: { off?: boolean; held?: boolean; next?: boolean; pulse?: boolean },
) => {
  const fill = held ? 0.45 : off ? 0 : 0.26;
  return {
    // Square with a small radius, like the buttons beside it — not a pill.
    borderRadius: 1,
    height: 26,
    flexShrink: 0,
    maxWidth: 200,
    border: held || next ? 2 : 1,
    borderColor: off ? alpha(tint, 0.55) : tint,
    // Dashed = disarmed (as in the editor), dotted = queued to run after the current loop.
    borderStyle: off ? 'dashed' : next ? 'dotted' : 'solid',
    bgcolor: alpha(tint, fill),
    color: off ? 'text.disabled' : 'text.primary',
    fontWeight: held ? 600 : 400,
    '& .MuiChip-icon, & .MuiChip-deleteIcon': { color: off ? 'text.disabled' : tint },
    '&:hover': { bgcolor: alpha(tint, fill + 0.12) },
    ...(pulsing
      ? {
          animation: `${pulse(tint)} 1.1s ease-in-out infinite`,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }
      : {}),
  } as const;
};

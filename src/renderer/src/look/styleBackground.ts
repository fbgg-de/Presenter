import type { ResolvedStyle } from '@/utils/styleUtils';
import type { BackgroundData } from './types';

/** What a theme puts behind the text: its colour. */
export const styleBackground = (style: ResolvedStyle): BackgroundData => ({ color: style.backgroundColor });

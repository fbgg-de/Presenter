import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from './index';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

/**
 * Some fields of a slice, re-rendering only when one of them changes. Selecting the whole slice
 * re-rendered every reader on any change to it — through MainPage, a slide change re-rendered the
 * entire operator view (~0.4 s in dev). No fields = the whole slice, for settings pages that
 * really read everything.
 */
export const useSliceFields = <S extends keyof RootState, K extends keyof RootState[S]>(slice: S, keys: K[]) =>
  useSelector((state: RootState) => {
    const source = state[slice];
    if (keys.length === 0) return source as Pick<RootState[S], K>;
    const picked = {} as Pick<RootState[S], K>;
    for (const key of keys) picked[key] = source[key];
    return picked;
  }, shallowEqual);

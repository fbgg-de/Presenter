/**
 * Device presets.
 *
 * `iphone-se` is the default and the one that matters: at 375×667 it is the smallest screen
 * the app realistically has to work on, and it is the only preset short enough to catch
 * vertical problems as well as horizontal ones.
 *
 * `deviceScaleFactor` is 1 everywhere on purpose. The suite measures CSS pixels, which a
 * higher ratio does not change — it only quadruples the size of every screenshot.
 *
 * Note `pixel-7` sits at 412px, above the `sm` breakpoint boundary but still a phone; and
 * `ipad-mini` at 768px is the first width where `useIsMobile()` is false, so it exercises the
 * desktop tree in a window far narrower than a desktop. Layouts break at both.
 */
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export const DEVICES = {
  'iphone-se': { id: 'iphone-se', name: 'iPhone SE', width: 375, height: 667, deviceScaleFactor: 1, mobile: true, userAgent: IOS_UA },
  'pixel-7': { id: 'pixel-7', name: 'Pixel 7', width: 412, height: 915, deviceScaleFactor: 1, mobile: true, userAgent: ANDROID_UA },
  'ipad-mini': { id: 'ipad-mini', name: 'iPad mini', width: 768, height: 1024, deviceScaleFactor: 1, mobile: true, userAgent: IPAD_UA },
};

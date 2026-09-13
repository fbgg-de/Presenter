/// <reference types="vite/client" />

/** Build identity injected by `appBuildDefines` in vite.shared.ts. */
declare const __APP_VERSION__: string;
/** Short commit hash, `-dirty` when built with uncommitted changes; empty without git. */
declare const __APP_COMMIT__: string;
/** ISO timestamp of the build (of the dev server start in development). */
declare const __APP_BUILD_TIME__: string;

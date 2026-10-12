/**
 * The build this page is: set by vite.config.ts at build time, so the version
 * on screen always matches the code that is running (the website included).
 */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT__: string;

export const VERSION = __APP_VERSION__;
/** Git commit it was built from; ends in "+" when built from uncommitted changes. */
export const COMMIT = __APP_COMMIT__;
export const BUILT = new Date(__APP_BUILT__);

/** "10 Oct 2026, 14:32" */
export const builtText = BUILT.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

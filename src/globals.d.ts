/** package.json version, injected by vite.config.ts. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Address for "Contact your administrator" / Help links on the login page. */
  readonly VITE_SUPPORT_EMAIL?: string;
}

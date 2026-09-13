// Web builds leave VITE_API_ORIGIN unset and stay same-origin. A native shell
// serves the SPA from capacitor://localhost or https://localhost, so it must
// point API and audio requests at the deployed Worker instead.
export function apiUrl(path: string, origin: string | undefined = import.meta.env.VITE_API_ORIGIN): string {
  return origin ? `${origin.replace(/\/+$/u, "")}${path}` : path;
}

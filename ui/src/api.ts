const rawBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
export const API_BASE = rawBase.replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

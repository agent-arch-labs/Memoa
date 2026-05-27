const NAMESPACE = "memoa";

export const VAULT_PATH_KEY = "vault_path";

export function getVaultPath(): string | null {
  const val = getString(VAULT_PATH_KEY, "");
  return val || null;
}

export function setVaultPath(val: string): void {
  setString(VAULT_PATH_KEY, val);
}

export function getJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${NAMESPACE}_${key}`);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return fallback;
}

export function setJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`${NAMESPACE}_${key}`, JSON.stringify(value));
  } catch {}
}

export function getString(key: string, fallback: string = ""): string {
  return localStorage.getItem(`${NAMESPACE}_${key}`) ?? fallback;
}

export function setString(key: string, value: string): void {
  localStorage.setItem(`${NAMESPACE}_${key}`, value);
}

export function remove(key: string): void {
  localStorage.removeItem(`${NAMESPACE}_${key}`);
}
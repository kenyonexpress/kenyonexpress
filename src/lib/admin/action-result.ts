// Uniform envelope for admin server actions (F6 / API-2).
// New actions return this; legacy { error } | { success } forms migrate
// opportunistically.

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string }

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message }
}

export function fail<T = undefined>(error: string): ActionResult<T> {
  return { ok: false, error }
}

import '@testing-library/jest-dom'

/**
 * A working `localStorage` for the jsdom environment.
 *
 * jsdom ships one, but it does not win here. Node itself now defines a global
 * `localStorage`, and this project's runner starts it without a store file --
 * hence the `--localstorage-file was provided without a valid path` warning
 * printed on every run. What reaches a test is an object with **no methods at
 * all**: `typeof localStorage` is `'object'`, and `localStorage.clear` is
 * `undefined`.
 *
 * That is worse than having none, because `typeof localStorage !== 'undefined'`
 * is exactly how browser code guards, so every such guard passes and then the
 * first call throws. Anything persisting to `localStorage` was untestable until
 * this existed.
 */
class MemoryStorage implements Storage {
  #entries = new Map<string, string>()

  get length(): number {
    return this.#entries.size
  }

  key(index: number): string | null {
    return [...this.#entries.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.#entries.get(String(key)) ?? null
  }

  setItem(key: string, value: string): void {
    this.#entries.set(String(key), String(value))
  }

  removeItem(key: string): void {
    this.#entries.delete(String(key))
  }

  clear(): void {
    this.#entries.clear()
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
}

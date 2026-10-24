'use client'

/** The one interactive piece of the maintenance page; the rest renders on the server. */
export function ReloadButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="inline-block rounded-lg bg-brand-dark px-8 py-3 text-base font-bold text-white transition-transform hover:scale-105"
    >
      נסו לרענן את הדף
    </button>
  )
}

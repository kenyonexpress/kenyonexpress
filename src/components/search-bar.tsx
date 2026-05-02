"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { IconSearch } from "./icons";

export function SearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) {
      router.push("/#deals");
      return;
    }
    router.push(`/?q=${encodeURIComponent(trimmed)}#deals`);
  }

  return (
    <form onSubmit={onSubmit} className="relative w-full" role="search">
      <label htmlFor="site-search" className="sr-only">
        חיפוש קופונים ומבצעים
      </label>
      <IconSearch className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
      <input
        id="site-search"
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="חפשו חנות, מותג או מוצר..."
        autoComplete="off"
        className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pe-4 ps-11 text-sm text-zinc-900 shadow-inner shadow-zinc-900/5 outline-none transition placeholder:text-zinc-400 focus:border-[var(--accent)] focus:bg-white focus:ring-2 focus:ring-[var(--accent)]/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-[var(--accent)] dark:focus:bg-zinc-950 dark:focus:ring-[var(--accent)]/25"
      />
    </form>
  );
}

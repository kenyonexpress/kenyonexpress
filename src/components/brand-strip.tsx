const brands = ["Wolt", "KSP", "Fox", "שופרסל", "Booking", "אייס", "נעלי נעלי", "H&M"];

export function BrandStrip() {
  return (
    <section
      id="brands"
      className="border-y border-zinc-200 bg-white py-8 dark:border-zinc-800 dark:bg-zinc-950"
      aria-labelledby="brands-heading"
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-6">
        <h2 id="brands-heading" className="text-center text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
          מותגים פופולריים
        </h2>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 sm:gap-x-14">
          {brands.map((name) => (
            <li key={name}>
              <span className="text-lg font-bold tracking-tight text-zinc-300 transition hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-300">
                {name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

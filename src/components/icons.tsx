import type { SVGProps } from "react";
import type { Category } from "@/lib/types";

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="m16.5 16.5 4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconCategory({
  icon,
  ...props
}: { icon: Category["icon"] } & SVGProps<SVGSVGElement>) {
  const stroke = "currentColor";
  const w = 1.6;
  switch (icon) {
    case "food":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
          <path
            d="M12 3v18M8 5h8M7 12h10M9 19h6"
            stroke={stroke}
            strokeWidth={w}
            strokeLinecap="round"
          />
        </svg>
      );
    case "fashion":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
          <path
            d="M7 7h10l1 5H6l1-5Z"
            stroke={stroke}
            strokeWidth={w}
            strokeLinejoin="round"
          />
          <path d="M9 7V5h6v2" stroke={stroke} strokeWidth={w} strokeLinecap="round" />
        </svg>
      );
    case "tech":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
          <rect x="5" y="4" width="14" height="11" rx="2" stroke={stroke} strokeWidth={w} />
          <path d="M9 19h6" stroke={stroke} strokeWidth={w} strokeLinecap="round" />
        </svg>
      );
    case "home":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
          <path
            d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
            stroke={stroke}
            strokeWidth={w}
            strokeLinejoin="round"
          />
        </svg>
      );
    case "travel":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
          <path
            d="M3 10h18l-2 8H5l-2-8Z"
            stroke={stroke}
            strokeWidth={w}
            strokeLinejoin="round"
          />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={stroke} strokeWidth={w} />
        </svg>
      );
    case "baby":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
          <circle cx="12" cy="9" r="3" stroke={stroke} strokeWidth={w} />
          <path
            d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6"
            stroke={stroke}
            strokeWidth={w}
            strokeLinecap="round"
          />
        </svg>
      );
    case "sport":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
          <circle cx="12" cy="12" r="8" stroke={stroke} strokeWidth={w} />
          <path d="M12 4v16M4 12h16" stroke={stroke} strokeWidth={w} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
          <path
            d="M4 7h16M4 12h10M4 17h14"
            stroke={stroke}
            strokeWidth={w}
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

export function IconSpark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2 9 9l-7 3 7 3 3 7 3-7 7-3-7-3-3-7Z" />
    </svg>
  );
}

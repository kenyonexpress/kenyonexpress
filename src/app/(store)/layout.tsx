import StoreShell from '@/components/store/StoreShell'
// cart-page.css is imported by the root layout, one request for the whole
// site. See the note there before moving it back down here.

/**
 * The storefront group's layout is `StoreShell` and nothing else. The shell
 * is a component so `/coupon/[slug]`, which cannot live in this group, can
 * render inside the same chrome; read the note there before adding anything
 * here that the coupon page would then lack.
 *
 * SYNCHRONOUS, and it has to stay that way: see `StoreShell`.
 */
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <StoreShell>{children}</StoreShell>
}

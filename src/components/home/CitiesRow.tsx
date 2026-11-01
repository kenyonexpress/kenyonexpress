/**
 * THE CITY CARDS ROW IS GONE (decision 15.10.2026, nationwide only; C137).
 *
 * The locked `HeroSection.tsx` still imports this module for the 170px strip
 * under the slider, so the module stays and renders the Apple and Tesla
 * products banners instead. No city name, no /c/<city> link, no location UI.
 */
export { default } from './HeroBrandBanners'

import type { ExpenseInvoice } from '@/app/actions/expenses';

// Validated 8-hue categorical set (dataviz skill reference palette) — fixed order,
// CVD-safe for adjacent pairs (stacked bars, ranked lists). Beyond 8 providers,
// fold into "Other".
export const PROVIDER_PALETTE_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const PROVIDER_PALETTE_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const OTHER_COLOR = '#9ca3af'; // neutral gray, distinct from every categorical slot
export const MAX_PROVIDER_SLOTS = 8;
export const OTHER_KEY = 'Other';
export const UNTAGGED_KEY = 'Untagged';

/** Stable provider → color assignment, ranked by overall spend (not per-chart rank),
 * so a provider always keeps the same color everywhere it appears in the domain. */
export function computeProviderColors(expenses: ExpenseInvoice[], isDarkMode: boolean) {
  const totals = new Map<string, number>();
  for (const e of expenses) totals.set(e.provider, (totals.get(e.provider) ?? 0) + Number(e.amount));
  const ranked = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(([provider]) => provider);
  const palette = isDarkMode ? PROVIDER_PALETTE_DARK : PROVIDER_PALETTE_LIGHT;
  const colorByProvider = new Map<string, string>();
  ranked.slice(0, MAX_PROVIDER_SLOTS).forEach((provider, i) => colorByProvider.set(provider, palette[i]));
  return { colorByProvider, rankedProviders: ranked };
}

/** Same idea as computeProviderColors, but keyed by tag (untagged invoices count
 * as their own "Untagged" category). */
export function computeTagColors(expenses: ExpenseInvoice[], isDarkMode: boolean) {
  const totals = new Map<string, number>();
  for (const e of expenses) {
    const tag = e.tag || UNTAGGED_KEY;
    totals.set(tag, (totals.get(tag) ?? 0) + Number(e.amount));
  }
  const ranked = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  const palette = isDarkMode ? PROVIDER_PALETTE_DARK : PROVIDER_PALETTE_LIGHT;
  const colorByTag = new Map<string, string>();
  ranked.slice(0, MAX_PROVIDER_SLOTS).forEach((tag, i) => colorByTag.set(tag, palette[i]));
  return { colorByTag, rankedTags: ranked };
}

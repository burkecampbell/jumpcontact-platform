// ── Brand System ────────────────────────────────────────────────────────────
// Three-position toggle: JC | Mixed | MSC
// URL-persistent via ?brand= query param

export type Brand = 'jc' | 'mixed' | 'msc';

export const BRANDS: Brand[] = ['jc', 'mixed', 'msc'];

export const BRAND_LABELS: Record<Brand, string> = {
  jc: 'JC',
  mixed: 'Mixed',
  msc: 'MSC',
};

export const BRAND_FULL_NAMES: Record<Brand, string> = {
  jc: 'Jump Contact',
  mixed: 'All Brands',
  msc: 'Med Spa Communications',
};

export const BRAND_ACCENT: Record<Brand, string> = {
  jc: '#3EA5C3',    // cyan
  mixed: '#a78bfa',  // purple — neutral, distinct from both brands
  msc: '#5BC5D4',   // teal
};

// ── Agent Sets ──────────────────────────────────────────────────────────────

export const MSC_ONLY_AGENTS = new Set([
  'sue', 'francis', 'natalie', 'desi', 'rebecca', 'sofia', 'richard', 'anthony',
]);

export const JC_ONLY_AGENTS = new Set([
  'omar', 'burke', 'ian', 'danny', 'chris', 'george', 'william',
]);

export const BLENDED_AGENTS = new Set([
  'sara', 'wendy',
]);

/** Check if an agent should appear for a given brand */
export function isAgentForBrand(agent: string, brand: Brand): boolean {
  const lower = agent.toLowerCase();
  switch (brand) {
    case 'jc':
      return !MSC_ONLY_AGENTS.has(lower);
    case 'msc':
      return MSC_ONLY_AGENTS.has(lower) || BLENDED_AGENTS.has(lower);
    case 'mixed':
      return true; // everyone
  }
}

/** Get the list of active agents for a brand */
export function getAgentsForBrand(brand: Brand, allAgents: string[]): string[] {
  return allAgents.filter(a => isAgentForBrand(a, brand));
}

// ── Ops Center ──────────────────────────────────────────────────────────────

export const OPS_CENTER_URL =
  process.env.NEXT_PUBLIC_OPS_CENTER_URL ||
  process.env.OPS_CENTER_URL ||
  'https://operations-center-phi.vercel.app';

// ── Validation ──────────────────────────────────────────────────────────────

export function isValidBrand(v: string | null): v is Brand {
  return v === 'jc' || v === 'mixed' || v === 'msc';
}

export function parseBrand(v: string | null | undefined): Brand {
  if (v && isValidBrand(v)) return v;
  return 'jc';
}

import { describe, it, expect } from 'vitest';
import {
  isAgentForBrand,
  getAgentsForBrand,
  isValidBrand,
  parseBrand,
  MSC_ONLY_AGENTS,
  JC_ONLY_AGENTS,
  BLENDED_AGENTS,
  BRAND_LABELS,
  BRAND_FULL_NAMES,
} from '../lib/brand';

// ── isAgentForBrand ───────────────────────────────────────────────

describe('isAgentForBrand', () => {
  it('JC brand includes JC-only agents', () => {
    expect(isAgentForBrand('omar', 'jc')).toBe(true);
    expect(isAgentForBrand('burke', 'jc')).toBe(true);
    expect(isAgentForBrand('danny', 'jc')).toBe(true);
  });

  it('JC brand includes blended agents', () => {
    expect(isAgentForBrand('sara', 'jc')).toBe(true);
    expect(isAgentForBrand('wendy', 'jc')).toBe(true);
  });

  it('JC brand excludes MSC-only agents', () => {
    expect(isAgentForBrand('sue', 'jc')).toBe(false);
    expect(isAgentForBrand('desi', 'jc')).toBe(false);
    expect(isAgentForBrand('francis', 'jc')).toBe(false);
  });

  it('MSC brand includes MSC-only agents', () => {
    expect(isAgentForBrand('sue', 'msc')).toBe(true);
    expect(isAgentForBrand('desi', 'msc')).toBe(true);
    expect(isAgentForBrand('natalie', 'msc')).toBe(true);
  });

  it('MSC brand includes blended agents', () => {
    expect(isAgentForBrand('sara', 'msc')).toBe(true);
    expect(isAgentForBrand('wendy', 'msc')).toBe(true);
  });

  it('MSC brand excludes JC-only agents', () => {
    expect(isAgentForBrand('omar', 'msc')).toBe(false);
    expect(isAgentForBrand('burke', 'msc')).toBe(false);
  });

  it('mixed brand includes everyone', () => {
    expect(isAgentForBrand('omar', 'mixed')).toBe(true);
    expect(isAgentForBrand('sue', 'mixed')).toBe(true);
    expect(isAgentForBrand('sara', 'mixed')).toBe(true);
    expect(isAgentForBrand('unknownagent', 'mixed')).toBe(true);
  });
});

// ── getAgentsForBrand ─────────────────────────────────────────────

describe('getAgentsForBrand', () => {
  const all = ['omar', 'burke', 'sue', 'desi', 'sara', 'wendy'];

  it('filters JC agents', () => {
    const result = getAgentsForBrand('jc', all);
    expect(result).toContain('omar');
    expect(result).toContain('burke');
    expect(result).toContain('sara');
    expect(result).not.toContain('sue');
    expect(result).not.toContain('desi');
  });

  it('filters MSC agents', () => {
    const result = getAgentsForBrand('msc', all);
    expect(result).toContain('sue');
    expect(result).toContain('desi');
    expect(result).toContain('sara');
    expect(result).not.toContain('omar');
  });

  it('mixed returns all', () => {
    const result = getAgentsForBrand('mixed', all);
    expect(result).toHaveLength(all.length);
  });
});

// ── Agent set integrity ───────────────────────────────────────────

describe('agent sets', () => {
  it('MSC and JC sets do not overlap', () => {
    for (const agent of MSC_ONLY_AGENTS) {
      expect(JC_ONLY_AGENTS.has(agent)).toBe(false);
    }
  });

  it('blended agents are not in MSC-only or JC-only', () => {
    for (const agent of BLENDED_AGENTS) {
      expect(MSC_ONLY_AGENTS.has(agent)).toBe(false);
      expect(JC_ONLY_AGENTS.has(agent)).toBe(false);
    }
  });

  it('sara and wendy are blended', () => {
    expect(BLENDED_AGENTS.has('sara')).toBe(true);
    expect(BLENDED_AGENTS.has('wendy')).toBe(true);
  });
});

// ── isValidBrand / parseBrand ─────────────────────────────────────

describe('isValidBrand', () => {
  it('accepts valid brands', () => {
    expect(isValidBrand('jc')).toBe(true);
    expect(isValidBrand('msc')).toBe(true);
    expect(isValidBrand('mixed')).toBe(true);
  });

  it('rejects invalid brands', () => {
    expect(isValidBrand('JC')).toBe(false);
    expect(isValidBrand('unknown')).toBe(false);
    expect(isValidBrand(null)).toBe(false);
    expect(isValidBrand('')).toBe(false);
  });
});

describe('parseBrand', () => {
  it('parses valid brands', () => {
    expect(parseBrand('jc')).toBe('jc');
    expect(parseBrand('msc')).toBe('msc');
    expect(parseBrand('mixed')).toBe('mixed');
  });

  it('defaults to jc for invalid/null/undefined', () => {
    expect(parseBrand(null)).toBe('jc');
    expect(parseBrand(undefined)).toBe('jc');
    expect(parseBrand('garbage')).toBe('jc');
    expect(parseBrand('')).toBe('jc');
  });
});

// ── Brand labels ──────────────────────────────────────────────────

describe('brand labels', () => {
  it('has correct short labels', () => {
    expect(BRAND_LABELS.jc).toBe('JC');
    expect(BRAND_LABELS.mixed).toBe('Mixed');
    expect(BRAND_LABELS.msc).toBe('MSC');
  });

  it('has correct full names', () => {
    expect(BRAND_FULL_NAMES.jc).toBe('Jump Contact');
    expect(BRAND_FULL_NAMES.msc).toBe('Med Spa Communications');
    expect(BRAND_FULL_NAMES.mixed).toBe('All Brands');
  });
});

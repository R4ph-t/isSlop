export type Span = {
  start: number;
  end: number;
};

export type Rule = {
  id: string;
  name: string;
  tier: number;
  category: string;
  why: string;
  try?: string;
  re?: RegExp;
  find?: (text: string) => Span[];
};

export type EmDashConfig = {
  re: RegExp;
  minCount: number;
  wordsPerDash: number;
  rule: Rule;
};

export type Pack = {
  id: string;
  name: string;
  verified?: boolean;
  locales?: string[];
  stopwords?: string[];
  rules: Rule[];
  emDash?: EmDashConfig | null;
};

export type Match = {
  start: number;
  end: number;
  rule: Rule;
};

export type Tiers = { 1: number; 2: number; 3: number };

export type CategoryCount = {
  name: string;
  count: number;
  weight: number;
};

export type Summary = {
  score: number;
  label: string;
  wordCount: number;
  tiers: Tiers;
  categories: CategoryCount[];
};

export type ScanResult = Summary & { matches: Match[] };

export type Finding = {
  id: string;
  name: string;
  snippet: string;
  tier: number;
};

export type PageSummary = Summary & {
  onDark?: boolean;
  scheme?: 'dark' | 'light';
  findings?: Finding[];
  scope?: 'article' | 'page';
  root?: string;
  pack?: { id: string; name: string; verified: boolean };
};

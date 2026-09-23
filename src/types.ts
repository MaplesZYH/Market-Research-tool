export const MAIN_CATEGORIES = ['tool', 'application', 'infrastructure', 'entertainment', 'education', 'research', 'other'] as const;
export type MainCategory = (typeof MAIN_CATEGORIES)[number];
export type Relevance = 'high' | 'medium' | 'low';

export interface GitHubRepository {
  full_name: string;
  html_url: string;
  description: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  license: { spdx_id?: string | null } | null;
  archived: boolean;
  fork: boolean;
  pushed_at: string | null;
  matchedQueries: string[];
}

export interface Classification {
  relevance: Relevance;
  mainCategory: MainCategory;
  secondaryTags: string[];
  confidence: number;
  evidence: string[];
  activityLevel: 'active' | 'normal' | 'stale' | 'archived';
}

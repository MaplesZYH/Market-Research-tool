import { config } from './config.js';
import type { Classification, MainCategory, Relevance } from './types.js';

interface LayaResponse {
  answers?: Record<string, { choice?: string; confidence?: number; noul?: number; score?: number }>;
}

const categories: MainCategory[] = ['tool', 'application', 'infrastructure', 'entertainment', 'education', 'research', 'other'];
const relevanceRank: Record<Relevance, number> = { low: 1, medium: 2, high: 3 };

// Laya's 1K context includes questions and protocol fields. Keep the text budget conservative.
export function estimateLayaTokens(text: string) {
  const cjk = (text.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  return cjk + Math.ceil((text.length - cjk) / 4);
}

export function splitForLaya(text: string, tokenBudget: number) {
  const normalized = text.replace(/\r/g, '').trim();
  if (!normalized) return [''];
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of normalized.split(/\n+/)) {
    const candidate = current ? `${current}\n${paragraph}` : paragraph;
    if (estimateLayaTokens(candidate) <= tokenBudget) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = '';
    let rest = paragraph;
    while (estimateLayaTokens(rest) > tokenBudget) {
      let cut = Math.max(1, Math.floor(rest.length * tokenBudget / Math.max(estimateLayaTokens(rest), 1)));
      while (cut > 1 && estimateLayaTokens(rest.slice(0, cut)) > tokenBudget) cut -= 1;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [normalized.slice(0, 1000)];
}

function fallbackClassification(text: string, pushedAt: string | null, archived: boolean): Classification {
  const lower = text.toLowerCase();
  const rules: Array<[MainCategory, string[]]> = [
    ['tool', ['cli', 'tool', 'sdk', 'plugin', 'extension', 'developer']],
    ['application', ['app', 'platform', 'dashboard', 'service', 'web app']],
    ['infrastructure', ['framework', 'database', 'server', 'api', 'runtime', 'protocol']],
    ['entertainment', ['game', 'music', 'video', 'comic', 'fun']],
    ['education', ['course', 'tutorial', 'learning', 'education', 'lesson']],
    ['research', ['paper', 'research', 'benchmark', 'dataset', 'experiment']]
  ];
  let best: MainCategory = 'other';
  let score = 0;
  for (const [category, words] of rules) {
    const current = words.filter((word) => lower.includes(word)).length;
    if (current > score) {
      score = current;
      best = category;
    }
  }
  const days = pushedAt ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86_400_000) : 9999;
  return {
    relevance: text.length > 30 ? 'medium' : 'low',
    mainCategory: best,
    secondaryTags: [],
    confidence: score > 0 ? Math.min(0.75, 0.45 + score * 0.1) : 0.3,
    evidence: text ? [text.slice(0, 240)] : [],
    activityLevel: archived ? 'archived' : days <= 90 ? 'active' : days <= 365 ? 'normal' : 'stale'
  };
}

async function requestLaya(text: string): Promise<Partial<Classification> | null> {
  if (!config.LAYA_URL) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.LAYA_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.LAYA_URL}/predict`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        state: { text },
        questions: {
          relevance: { type: 'choice', instructions: 'Is this repository relevant to the keyword?', criteria: ['high', 'medium', 'low'] },
          category: { type: 'choice', instructions: 'What is the primary category?', criteria: categories },
          confidence: { type: 'score', instructions: 'How confident is the classification?', criteria: ['low', 'medium', 'high'] }
        }
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const result = (await response.json()) as LayaResponse;
    const answers = result.answers ?? {};
    const category = answers.category?.choice;
    const relevance = answers.relevance?.choice;
    return {
      mainCategory: categories.includes(category as MainCategory) ? category as MainCategory : undefined,
      relevance: relevance === 'high' || relevance === 'medium' || relevance === 'low' ? relevance : undefined,
      confidence: answers.category?.confidence,
      evidence: [text.slice(0, 240)]
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function classifyWithLaya(input: { text: string; pushedAt: string | null; archived: boolean }): Promise<Classification> {
  const fallback = fallbackClassification(input.text, input.pushedAt, input.archived);
  const chunks = splitForLaya(input.text, config.LAYA_INPUT_TOKEN_BUDGET);
  if (!config.LAYA_URL) return fallback;

  const decisions: Array<Partial<Classification>> = [];
  for (const chunk of chunks) {
    const decision = await requestLaya(chunk);
    if (decision) decisions.push(decision);
  }
  if (!decisions.length) return fallback;

  const categoryScores = new Map<MainCategory, number>();
  for (const decision of decisions) {
    if (!decision.mainCategory) continue;
    const relevanceWeight = decision.relevance ? relevanceRank[decision.relevance] / 3 : 0.5;
    const confidence = decision.confidence ?? 0.5;
    categoryScores.set(decision.mainCategory, (categoryScores.get(decision.mainCategory) ?? 0) + relevanceWeight * confidence);
  }
  const mainCategory = [...categoryScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback.mainCategory;
  const relevance = [...decisions].sort((a, b) => relevanceRank[b.relevance ?? 'low'] - relevanceRank[a.relevance ?? 'low'])[0]?.relevance ?? fallback.relevance;
  const confidence = Math.max(...decisions.map((decision) => decision.confidence ?? 0), fallback.confidence);
  const evidence = [...new Set(decisions.flatMap((decision) => decision.evidence ?? []))].slice(0, 3);
  return { ...fallback, mainCategory, relevance, confidence: Math.min(confidence, 0.99), evidence: evidence.length ? evidence : fallback.evidence };
}

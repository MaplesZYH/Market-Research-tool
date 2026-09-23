import type { Classification, GitHubRepository } from './types.js';
import type { MarketAnalysis, ProjectAnalysis } from './ai.js';

export type ProjectRecord = GitHubRepository & {
  classification: Classification;
  projectAnalysis: ProjectAnalysis;
};

export interface MarketReport {
  keyword: string;
  inputMode?: string;
  requestText?: string | null;
  searchPlan?: { queries?: string[]; assumptions?: string[] } | null;
  generatedAt: string;
  totalHits: number;
  validProjects: number;
  categories: Array<{ category: string; count: number; percentage: number }>;
  marketAnalysis: MarketAnalysis | null;
  repositories: ProjectRecord[];
}

export function buildReport(repositories: ProjectRecord[], keyword: string, marketAnalysis: MarketAnalysis | null = null): MarketReport {
  const valid = repositories.filter((repository) => repository.classification.relevance !== 'low');
  const counts = new Map<string, number>();
  for (const repository of valid) {
    const category = repository.classification.mainCategory;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const categories = [...counts.entries()].map(([category, count]) => ({ category, count, percentage: valid.length ? Number(((count / valid.length) * 100).toFixed(1)) : 0 }));
  return { keyword, generatedAt: new Date().toISOString(), totalHits: repositories.length, validProjects: valid.length, categories, marketAnalysis, repositories };
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function list(items: string[] | undefined) {
  return (items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

export function renderHtmlReport(report: MarketReport) {
  const categories = report.categories.map((category) => `<tr><td>${escapeHtml(category.category)}</td><td>${category.count}</td><td>${category.percentage}%</td></tr>`).join('');
  const repositories = report.repositories.map((repository) => `<article class="project"><h3><a href="${escapeHtml(repository.html_url)}" target="_blank" rel="noreferrer">${escapeHtml(repository.full_name)}</a></h3><p>${escapeHtml(repository.projectAnalysis.summary)}</p><p class="muted">${escapeHtml(repository.description)} · ${repository.stargazers_count} Stars · ${escapeHtml(repository.classification.mainCategory)}</p></article>`).join('');
  const analysis = report.marketAnalysis;
  const plan = report.searchPlan ? `<section><h2>搜索计划</h2><p>${(report.searchPlan.queries ?? []).map(escapeHtml).join(' · ')}</p><p class="muted">${(report.searchPlan.assumptions ?? []).map(escapeHtml).join('；')}</p></section>` : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GitHub 市场报告：${escapeHtml(report.keyword)}</title><style>body{max-width:1100px;margin:40px auto;padding:0 20px;font:15px/1.6 system-ui,sans-serif;color:#202124}table{width:100%;border-collapse:collapse;margin:12px 0 28px}th,td{text-align:left;border-bottom:1px solid #eee;padding:8px;vertical-align:top}.project{border:1px solid #e4e4e4;border-radius:8px;padding:14px;margin:12px 0}.muted{color:#666}.meta{color:#666}li{margin:4px 0}</style></head><body><h1>GitHub 市场报告：${escapeHtml(report.keyword)}</h1><p class="meta">模式：${escapeHtml(report.inputMode)} · 生成时间：${escapeHtml(report.generatedAt)}，有效项目：${report.validProjects} / ${report.totalHits}</p>${plan}${analysis ? `<section><h2>核心结论</h2><h3>市场机会</h3><p>${escapeHtml(analysis.marketOpportunity)}</p><h3>核心痛点</h3><ul>${list(analysis.corePainPoints)}</ul><h3>最大风险</h3><ul>${list(analysis.biggestRisks)}</ul><h3>产品建议</h3><ul>${list(analysis.productAdvice)}</ul><h3>MVP</h3><ul>${list(analysis.mvp)}</ul><h3>优先客户</h3><ul>${list(analysis.priorityCustomers)}</ul><h3>竞品分析</h3><p>${escapeHtml(analysis.competitorAnalysis)}</p></section>` : ''}<section><h2>分类分布</h2><table><thead><tr><th>分类</th><th>数量</th><th>比例</th></tr></thead><tbody>${categories}</tbody></table></section><section><h2>项目清单</h2>${repositories}</section></body></html>`;
}

import { config } from './config.js';

export interface ProjectAnalysis {
  summary: string;
  problem: string;
  targetUsers: string;
  coreFeatures: string[];
  techStack: string[];
  businessModel: string;
  competitorSignals: string[];
}

export interface MarketAnalysis {
  coreConclusions: string[];
  marketOpportunity: string;
  corePainPoints: string[];
  biggestRisks: string[];
  productAdvice: string[];
  mvp: string[];
  priorityCustomers: string[];
  competitorAnalysis: string;
}

export interface ResearchPlan {
  topic: string;
  researchQuestions: string[];
  candidateKeywords: string[];
  excludeTerms: string[];
  assumptions: string[];
  queries: string[];
}

type ChatResponse = { choices?: Array<{ message?: { content?: string } }> };

function parseJson<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    try {
      return match ? JSON.parse(match[0]) as T : null;
    } catch {
      return null;
    }
  }
}

async function chat(system: string, input: unknown) {
  if (!config.AI_API_BASE_URL || !config.AI_API_KEY || !config.AI_API_MODEL) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.AI_API_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.AI_API_BASE_URL}${config.AI_API_CHAT_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${config.AI_API_KEY}` },
      body: JSON.stringify({
        model: config.AI_API_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: `${system}\n只根据输入内容回答。不要编造仓库事实。返回 JSON，不要 Markdown。` },
          { role: 'user', content: JSON.stringify(input) }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const body = await response.json() as ChatResponse;
    return body.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackResearchPlan(request: string): ResearchPlan {
  const topic = request.trim().replace(/[。！？.!?].*$/, '').slice(0, 120);
  const stopWords = new Set(['github', 'project', 'projects', 'repo', 'repository', 'please', 'want', 'know', 'using', 'about']);
  const keywordMatches = (request.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? []).filter((value) => !stopWords.has(value.toLowerCase()));
  const candidates = [...new Set(keywordMatches)].slice(0, 6);
  const base = candidates[0] ?? topic;
  return {
    topic,
    researchQuestions: ['行业目前有哪些应用方向？', '项目主要服务哪些用户？', '不同项目之间有哪些功能和技术差异？'],
    candidateKeywords: candidates.length ? candidates : [base],
    excludeTerms: [],
    assumptions: ['自然语言需求的范围可能不完整，先通过公开项目探索行业实际用法。'],
    queries: [...new Set([base, ...candidates.slice(1), `${base} tool`, `${base} application`, `${base} framework`])]
  };
}

export async function planResearch(request: string): Promise<ResearchPlan> {
  const fallback = fallbackResearchPlan(request);
  const content = await chat('你是 GitHub 市场研究规划器。把自然语言需求转换为探索性研究计划。优先发现行业正在做什么，不要假设用户已经知道产品方向。queries 只返回适合 GitHub 搜索的短关键词或短语。', {
    request,
    output: { topic: 'string', researchQuestions: ['string'], candidateKeywords: ['string'], excludeTerms: ['string'], assumptions: ['string'], queries: ['string'] }
  });
  const parsed = content ? parseJson<Partial<ResearchPlan>>(content) : null;
  const queries = [...new Set((parsed?.queries ?? fallback.queries).map((value) => String(value).trim()).filter(Boolean))].slice(0, 20);
  return {
    topic: parsed?.topic?.trim() || fallback.topic,
    researchQuestions: parsed?.researchQuestions?.length ? parsed.researchQuestions : fallback.researchQuestions,
    candidateKeywords: parsed?.candidateKeywords?.length ? parsed.candidateKeywords : fallback.candidateKeywords,
    excludeTerms: parsed?.excludeTerms ?? fallback.excludeTerms,
    assumptions: parsed?.assumptions?.length ? parsed.assumptions : fallback.assumptions,
    queries: queries.length ? queries : fallback.queries
  };
}

export async function analyzeProject(input: { name: string; description: string | null; readme: string | null; category: string; language: string | null; stars: number }): Promise<ProjectAnalysis> {
  const fallback: ProjectAnalysis = {
    summary: input.description || `${input.name} 是一个归类为「${input.category}」的 GitHub 项目。`,
    problem: input.description || '项目 README 信息不足，待人工确认。',
    targetUsers: '待根据 README 和项目主页确认。',
    coreFeatures: input.description ? [input.description] : [],
    techStack: input.language ? [input.language] : [],
    businessModel: '公开资料不足，待人工确认。',
    competitorSignals: []
  };
  const content = await chat('你是开源项目研究员。为单个项目写通俗易懂的短摘要，并识别它解决的问题、目标用户、核心功能、技术栈、商业模式线索和同类竞品线索。', {
    ...input,
    readme: input.readme?.slice(0, 12000) ?? null
  });
  const parsed = content ? parseJson<Partial<ProjectAnalysis>>(content) : null;
  return {
    ...fallback,
    ...parsed,
    summary: parsed?.summary?.trim() || fallback.summary,
    coreFeatures: parsed?.coreFeatures ?? fallback.coreFeatures,
    techStack: parsed?.techStack ?? fallback.techStack,
    competitorSignals: parsed?.competitorSignals ?? fallback.competitorSignals
  };
}

export async function analyzeMarket(input: { keyword: string; totalProjects: number; categories: unknown; projects: Array<{ name: string; summary: string; category: string; stars: number }> }): Promise<MarketAnalysis | null> {
  const content = await chat('你是 GitHub 市场调研分析师。请基于项目清单给出市场机会、核心痛点、最大风险、产品建议、MVP、优先客户和同类竞品分析。百分比和数量必须只根据输入数据，不要编造。', input);
  return content ? parseJson<MarketAnalysis>(content) : null;
}

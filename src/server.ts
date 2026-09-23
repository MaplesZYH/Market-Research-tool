import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { config } from './config.js';
import { query, updateScan } from './db.js';
import { discoverRepositories, fetchRepositoryReadme } from './github.js';
import { analyzeMarket, analyzeProject, planResearch, type MarketAnalysis, type ResearchPlan } from './ai.js';
import { classifyWithLaya } from './laya.js';
import { buildReport, renderHtmlReport, type ProjectRecord } from './report.js';

const app = Fastify({ logger: true });
await app.register(fastifyStatic, { root: resolve(process.cwd(), 'public') });

app.get('/health', async () => ({ ok: true }));

app.post<{ Body: { keyword?: string; request?: string; mode?: 'keyword' | 'natural_language'; maxResults?: number } }>('/api/scans', async (request, reply) => {
  const mode = request.body.mode ?? (request.body.request ? 'natural_language' : 'keyword');
  const input = (mode === 'natural_language' ? request.body.request : request.body.keyword)?.trim();
  if (!input) return reply.code(400).send({ error: mode === 'natural_language' ? 'request is required' : 'keyword is required' });
  const maxResults = Math.min(Math.max(request.body.maxResults ?? config.GITHUB_MAX_RESULTS, 1), 1000);
  const id = randomUUID();
  const keyword = mode === 'keyword' ? input : input.slice(0, 120);
  await query('INSERT INTO scans (id, keyword, input_mode, request_text, max_results, status) VALUES ($1, $2, $3, $4, $5, $6)', [id, keyword, mode, input, maxResults, 'created']);
  void runScan(id, input, mode, maxResults);
  return reply.code(202).send({ id, status: 'created', mode });
});

app.get<{ Params: { id: string } }>('/api/scans/:id', async (request, reply) => {
  const result = await query('SELECT id, keyword, input_mode, request_text, research_spec, search_plan, status, max_results, total_hits, valid_projects, excluded_projects, error_message, created_at, completed_at FROM scans WHERE id = $1', [request.params.id]);
  if (!result.rows[0]) return reply.code(404).send({ error: 'scan not found' });
  return result.rows[0];
});

app.get<{ Params: { id: string }; Querystring: { page?: string; pageSize?: string } }>('/api/scans/:id/report', async (request, reply) => {
  const page = Math.max(Number(request.query.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(request.query.pageSize ?? 20), 1), 100);
  const scanResult = await query<{ id: string; keyword: string; input_mode: string; request_text: string | null; research_spec: unknown; search_plan: unknown; market_analysis: MarketAnalysis | null }>('SELECT id, keyword, input_mode, request_text, research_spec, search_plan, market_analysis FROM scans WHERE id = $1', [request.params.id]);
  if (!scanResult.rows[0]) return reply.code(404).send({ error: 'scan not found' });
  const rows = await query('SELECT * FROM repositories WHERE scan_id = $1 ORDER BY stars DESC', [request.params.id]);
  const report = buildReport(rows.rows.map(toProjectRecord), scanResult.rows[0].keyword, scanResult.rows[0].market_analysis);
  const totalPages = Math.max(Math.ceil(report.repositories.length / pageSize), 1);
  return { scanId: request.params.id, inputMode: scanResult.rows[0].input_mode, requestText: scanResult.rows[0].request_text, researchSpec: scanResult.rows[0].research_spec, searchPlan: scanResult.rows[0].search_plan, ...report, page, pageSize, totalPages, repositories: report.repositories.slice((page - 1) * pageSize, page * pageSize) };
});

app.get<{ Params: { id: string } }>('/api/scans/:id/report.html', async (request, reply) => {
  const scanResult = await query<{ id: string; keyword: string; input_mode: string; request_text: string | null; search_plan: { queries?: string[]; assumptions?: string[] } | null; market_analysis: MarketAnalysis | null }>('SELECT id, keyword, input_mode, request_text, search_plan, market_analysis FROM scans WHERE id = $1', [request.params.id]);
  if (!scanResult.rows[0]) return reply.code(404).send({ error: 'scan not found' });
  const rows = await query('SELECT * FROM repositories WHERE scan_id = $1 ORDER BY stars DESC', [request.params.id]);
  const report = { ...buildReport(rows.rows.map(toProjectRecord), scanResult.rows[0].keyword, scanResult.rows[0].market_analysis), inputMode: scanResult.rows[0].input_mode, requestText: scanResult.rows[0].request_text, searchPlan: scanResult.rows[0].search_plan };
  return reply.type('text/html; charset=utf-8').header('Content-Disposition', `attachment; filename="github-market-${request.params.id}.html"`).send(renderHtmlReport(report));
});

function toProjectRecord(row: any): ProjectRecord {
  return {
    full_name: row.full_name,
    html_url: row.html_url,
    description: row.description,
    topics: row.topics,
    stargazers_count: row.stars,
    forks_count: row.forks,
    language: row.language,
    license: row.license_spdx ? { spdx_id: row.license_spdx } : null,
    archived: row.archived,
    fork: row.is_fork,
    pushed_at: row.pushed_at,
    matchedQueries: row.matched_queries,
    classification: {
      relevance: row.relevance,
      mainCategory: row.main_category,
      secondaryTags: row.secondary_tags,
      confidence: Number(row.confidence ?? 0),
      evidence: row.evidence,
      activityLevel: row.activity_level
    },
    projectAnalysis: row.project_analysis ?? {
      summary: row.project_summary ?? row.description ?? '',
      problem: '', targetUsers: '', coreFeatures: [], techStack: [], businessModel: '', competitorSignals: []
    }
  };
}

async function runScan(id: string, input: string, mode: 'keyword' | 'natural_language', maxResults: number) {
  try {
    let keyword = input;
    let researchPlan: ResearchPlan | null = null;
    if (mode === 'natural_language') {
      researchPlan = await planResearch(input);
      keyword = researchPlan.topic;
      await updateScan(id, { research_spec: JSON.stringify(researchPlan), search_plan: JSON.stringify({ queries: researchPlan.queries, assumptions: researchPlan.assumptions }) });
    } else {
      await updateScan(id, { research_spec: JSON.stringify({ topic: input, candidateKeywords: [input], assumptions: [] }), search_plan: JSON.stringify({ queries: [input], assumptions: [] }) });
    }
    await updateScan(id, { status: 'discovering', started_at: new Date() });
    const queries = researchPlan?.queries ?? [input];
    const discovered = await discoverRepositories(queries, maxResults);
    await updateScan(id, { total_hits: discovered.repositories.length, status: 'classifying' });
    let excluded = 0;
    const classified: ProjectRecord[] = [];
    for (const repository of discovered.repositories) {
      if (repository.fork || repository.archived) {
        excluded += 1;
        continue;
      }
      const readme = config.GITHUB_FETCH_README ? await fetchRepositoryReadme(repository.full_name) : null;
      const classification = await classifyWithLaya({
        text: [repository.full_name, repository.description ?? '', ...repository.topics, readme ?? ''].join('\n'),
        pushedAt: repository.pushed_at,
        archived: repository.archived
      });
      const projectAnalysis = await analyzeProject({
        name: repository.full_name,
        description: repository.description,
        readme,
        category: classification.mainCategory,
        language: repository.language,
        stars: repository.stargazers_count
      });
      const project: ProjectRecord = { ...repository, classification, projectAnalysis };
      classified.push(project);
      await query(`INSERT INTO repositories
        (scan_id, full_name, html_url, description, topics, stars, forks, language, license_spdx, archived, is_fork, pushed_at, matched_queries, relevance, main_category, secondary_tags, confidence, evidence, activity_level, project_summary, project_analysis)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        ON CONFLICT (scan_id, full_name) DO UPDATE SET relevance = EXCLUDED.relevance, main_category = EXCLUDED.main_category, confidence = EXCLUDED.confidence, project_summary = EXCLUDED.project_summary, project_analysis = EXCLUDED.project_analysis`, [
        id, repository.full_name, repository.html_url, repository.description, JSON.stringify(repository.topics), repository.stargazers_count,
        repository.forks_count, repository.language, repository.license?.spdx_id ?? null, repository.archived, repository.fork,
        repository.pushed_at, JSON.stringify(repository.matchedQueries), classification.relevance, classification.mainCategory,
        JSON.stringify(classification.secondaryTags), classification.confidence, JSON.stringify(classification.evidence), classification.activityLevel,
        projectAnalysis.summary, JSON.stringify(projectAnalysis)
      ]);
    }
    const validProjects = classified.filter((project) => project.classification.relevance !== 'low');
    await updateScan(id, { excluded_projects: excluded, valid_projects: validProjects.length, status: 'analyzing' });
    const draft = buildReport(classified, keyword);
    const marketAnalysis = await analyzeMarket({
      keyword,
      totalProjects: validProjects.length,
      categories: draft.categories,
      projects: validProjects.map((project) => ({ name: project.full_name, summary: project.projectAnalysis.summary, category: project.classification.mainCategory, stars: project.stargazers_count }))
    });
    await updateScan(id, { market_analysis: marketAnalysis ? JSON.stringify(marketAnalysis) : null, status: discovered.partial ? 'partial' : 'completed', completed_at: new Date() });
  } catch (error) {
    app.log.error(error);
    await updateScan(id, { status: 'failed', error_message: error instanceof Error ? error.message : String(error), completed_at: new Date() });
  }
}

app.listen({ port: config.PORT, host: '0.0.0.0' }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});

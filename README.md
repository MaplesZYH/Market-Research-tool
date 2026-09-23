# Market Research Tool

一个基于真实 GitHub 开源项目的市场研究工具。输入关键词或自然语言研究需求，系统检索公开仓库，使用 Laya 做相关性和分类判断，再生成项目摘要、行业归类、竞品分析和产品建议。

An evidence-based market research tool built on real public GitHub projects. Enter a keyword or a natural-language research request. The tool discovers repositories, uses Laya for relevance and classification, and generates project summaries, market segmentation, competitor analysis, and product recommendations.

## Features / 功能

- 关键词高召回发现模式 / High-recall keyword discovery
- 自然语言行业探索模式 / Natural-language exploratory research
- GitHub 项目去重、Fork/Archived 处理和来源记录 / Repository deduplication and source tracking
- Laya 相关性、主分类、活跃度和置信度判断 / Laya-powered relevance and classification
- 针对 Laya 1K 上下文的 README 分块 / Chunked README processing for Laya's 1K context
- 每个项目的通俗摘要 / Plain-language summary for every project
- 市场机会、核心痛点、最大风险、MVP、优先客户和竞品分析 / Market opportunities, risks, MVP, customers, and competitor analysis
- PostgreSQL 持久化和分页项目清单 / PostgreSQL persistence and paginated project listings
- 原生 HTML 报告下载 / Downloadable HTML reports

## Architecture / 架构

```text
Fastify + TypeScript
  ├─ GitHub REST API
  ├─ Local Laya Python HTTP service
  ├─ Configurable AI API
  ├─ PostgreSQL
  └─ Native HTML report panel
```

Laya handles structured decisions such as relevance and category. Your configured AI API handles research-plan generation, project summaries, and market synthesis. Statistics are calculated by the application, not guessed by a model.

Laya 负责相关性、分类等结构化判断。你配置的 AI API 负责研究计划、项目摘要和市场分析。数量和百分比由程序计算，不由模型估算。

## Requirements / 环境要求

- Node.js 22+
- PostgreSQL 14+
- A local Laya Python HTTP service / 本地 Laya Python HTTP 服务
- Optional AI API / 可选 AI API
- A GitHub token is recommended for higher API limits / 建议配置 GitHub Token 以提高 API 限额

## Quick start / 快速开始

```bash
npm install
cp .env.example .env
# 编辑 .env
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`.

打开 `http://localhost:3000`。

## Input modes / 输入模式

### Keyword discovery / 关键词发现

This mode favors recall. It keeps keyword matches as candidates before Laya classification, so weakly related projects are not silently discarded too early.

此模式优先保证召回率。关键词命中的项目会先保存为候选，再交给 Laya 判断，不会过早静默丢弃弱相关项目。

```bash
curl -X POST http://localhost:3000/api/scans \
  -H 'content-type: application/json' \
  -d '{"mode":"keyword","keyword":"jev","maxResults":100}'
```

### Natural-language research / 自然语言研究

This mode first converts the request into research questions, candidate keywords, assumptions, and a search plan. It is exploratory rather than perfectly precise: the report shows the plan and its coverage limits.

此模式会先把需求转换成研究问题、候选关键词、假设和搜索计划。它的目标是探索行业实际用法，不承诺一次解析就完全精准；报告会展示搜索计划和覆盖边界。

```bash
curl -X POST http://localhost:3000/api/scans \
  -H 'content-type: application/json' \
  -d '{"mode":"natural_language","request":"我想了解 GitHub 上大家如何用 jev 做开发工具和应用","maxResults":100}'
```

## Reports / 报告

```text
GET /api/scans/:id
GET /api/scans/:id/report?page=1&pageSize=20
GET /api/scans/:id/report.html
```

The report separates project evidence from model-generated interpretation. It includes:

报告会区分项目事实和模型分析，并包含：

- project summaries and source links / 项目通俗摘要和来源链接
- category counts and percentages / 分类数量和百分比
- market opportunities and pain points / 市场机会和核心痛点
- risks and product recommendations / 风险和产品建议
- MVP and priority customers / MVP 和优先客户
- competitor analysis / 竞品分析
- search plan, assumptions, and coverage limits / 搜索计划、假设和覆盖边界

## Environment variables / 环境变量

Copy `.env.example` to `.env`. Never commit `.env`.

复制 `.env.example` 为 `.env`。不要提交 `.env`。

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/github_market_scanner
GITHUB_TOKEN=

LAYA_URL=http://127.0.0.1:8001
LAYA_INPUT_TOKEN_BUDGET=700

AI_API_BASE_URL=
AI_API_KEY=
AI_API_MODEL=
AI_API_CHAT_PATH=/v1/chat/completions
```

## Laya contract / Laya 接口约定

The TypeScript service calls `${LAYA_URL}/predict`:

TypeScript 服务调用 `${LAYA_URL}/predict`：

```json
{
  "state": { "text": "repository text" },
  "questions": {
    "relevance": { "type": "choice", "criteria": ["high", "medium", "low"] },
    "category": { "type": "choice", "criteria": ["tool", "application", "infrastructure", "entertainment", "education", "research", "other"] }
  }
}
```

README content is truncated and split before it is sent to Laya. The default input budget is 700 estimated tokens, leaving room for the question schema inside the 1K context window.

README 会在发送给 Laya 前截断并分块。默认单块预算为 700 个估算 Token，为 1K 上下文中的问题定义和协议字段预留空间。

## Security boundaries / 安全边界

- Only public repositories are scanned by default / 默认只扫描公开仓库
- Repository text is untrusted input / README、Issue 和代码注释均视为不可信输入
- The tool never executes repository code / 工具不会执行仓库代码
- Missing or unclear licenses are flagged for review / 缺失或不明确的 License 会标记为人工复核
- Reports state API limits and search coverage / 报告会说明 API 限制和搜索覆盖范围
- Secrets belong only in `.env` / Token 只能放在 `.env`

## Development / 开发

```bash
npm run build
npm run db:migrate
npm run dev
```

Internal planning documents are intentionally not included in this public repository.

内部 OpenSpec、PRD 和实施规划文件不会上传到这个公开仓库。

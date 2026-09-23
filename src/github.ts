import { config } from './config.js';
import type { GitHubRepository } from './types.js';

const API_URL = 'https://api.github.com/search/repositories';

async function githubFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(config.GITHUB_TOKEN ? { Authorization: `Bearer ${config.GITHUB_TOKEN}` } : {})
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

interface SearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: Array<Omit<GitHubRepository, 'matchedQueries'> & { license: { spdx_id?: string | null } | null }>;
}

interface ReadmeResponse {
  content?: string;
  encoding?: string;
}

export async function fetchRepositoryReadme(fullName: string) {
  try {
    const result = await githubFetch<ReadmeResponse>(`https://api.github.com/repos/${fullName}/readme`);
    if (!result.content) return null;
    const content = result.encoding === 'base64'
      ? Buffer.from(result.content.replace(/\n/g, ''), 'base64').toString('utf8')
      : result.content;
    return content.slice(0, config.GITHUB_README_MAX_CHARS);
  } catch {
    return null;
  }
}

export async function discoverRepositories(keywords: string[], maxResults: number) {
  const queries = [...new Set(keywords.flatMap((keyword) => [
    `${keyword} in:name,description,readme is:public`,
    `topic:${keyword} is:public`
  ]))];
  const repositories = new Map<string, GitHubRepository>();
  let totalHits = 0;
  let partial = false;

  for (const query of queries) {
    const pages = Math.ceil(maxResults / 100);
    for (let page = 1; page <= pages && repositories.size < maxResults; page += 1) {
      const url = `${API_URL}?q=${encodeURIComponent(query)}&per_page=100&page=${page}`;
      const result = await githubFetch<SearchResponse>(url);
      totalHits += result.total_count;
      partial ||= result.incomplete_results;
      for (const item of result.items) {
        const existing = repositories.get(item.full_name);
        repositories.set(item.full_name, {
          ...item,
          matchedQueries: [...new Set([...(existing?.matchedQueries ?? []), query])]
        });
        if (repositories.size >= maxResults) break;
      }
      if (result.items.length < 100) break;
    }
  }

  return { repositories: [...repositories.values()], totalHits, partial };
}

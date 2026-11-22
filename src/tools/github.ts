export type ToolArgs = Record<string, unknown>;

const GITHUB_API = "https://api.github.com";

function token(): string | undefined {
  return process.env.GITHUB_TOKEN?.trim() || undefined;
}

async function gh<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", "Interface");
  const t = token();
  if (t) headers.set("Authorization", `Bearer ${t}`);

  const res = await fetch(`${GITHUB_API}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GitHub ${res.status} ${path}: ${body.slice(0, 240) || res.statusText}`,
    );
  }
  return (await res.json()) as T;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parseRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error('repo must be "owner/name"');
  }
  return { owner, name };
}

type Repo = {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  private: boolean;
};

type Issue = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: { login: string } | null;
  labels: Array<{ name: string }>;
  created_at: string;
  pull_request?: unknown;
};

type Pull = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: { login: string } | null;
  draft: boolean;
  created_at: string;
  head: { ref: string };
  base: { ref: string };
};

type User = {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  public_repos: number;
  followers: number;
};

export async function listRepos(args: ToolArgs = {}) {
  const user = asString(args.user);
  const perPage = Math.min(Number(args.per_page) || 30, 100);
  const path = user
    ? `/users/${encodeURIComponent(user)}/repos?sort=updated&per_page=${perPage}`
    : `/user/repos?sort=updated&per_page=${perPage}&affiliation=owner,collaborator`;

  if (!user && !token()) {
    throw new Error(
      "GITHUB_TOKEN required for listRepos without a user (authenticated /user/repos)",
    );
  }

  const repos = await gh<Repo[]>(path);
  return repos.map((r) => ({
    full_name: r.full_name,
    url: r.html_url,
    description: r.description,
    language: r.language,
    stars: r.stargazers_count,
    updated_at: r.updated_at,
    private: r.private,
  }));
}

export async function listIssues(args: ToolArgs = {}) {
  const repo = asString(args.repo);
  if (!repo) throw new Error("repo is required (owner/name)");
  const { owner, name } = parseRepo(repo);
  const state = asString(args.state, "open");
  const perPage = Math.min(Number(args.per_page) || 30, 100);

  const issues = await gh<Issue[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues?state=${encodeURIComponent(state)}&per_page=${perPage}`,
  );

  return issues
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      url: i.html_url,
      author: i.user?.login ?? null,
      labels: i.labels.map((l) => l.name),
      created_at: i.created_at,
    }));
}

export async function listPRs(args: ToolArgs = {}) {
  const repo = asString(args.repo);
  const user = asString(args.user);
  const state = asString(args.state, "open");
  const perPage = Math.min(Number(args.per_page) || 30, 100);

  if (repo) {
    const { owner, name } = parseRepo(repo);
    const prs = await gh<Pull[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls?state=${encodeURIComponent(state)}&per_page=${perPage}`,
    );
    return prs.map((p) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      draft: p.draft,
      url: p.html_url,
      author: p.user?.login ?? null,
      head: p.head.ref,
      base: p.base.ref,
      created_at: p.created_at,
    }));
  }

  // Authenticated "my PRs" via search
  const me = user || (await getUser({})).login;
  const q = encodeURIComponent(`author:${me} is:pr`);
  const data = await gh<{
    items: Array<{
      number: number;
      title: string;
      state: string;
      html_url: string;
      user: { login: string } | null;
      created_at: string;
      draft?: boolean;
      repository_url: string;
    }>;
  }>(`/search/issues?q=${q}&per_page=${perPage}&sort=updated`);

  return data.items.map((p) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    draft: Boolean(p.draft),
    url: p.html_url,
    author: p.user?.login ?? null,
    repo: p.repository_url.replace("https://api.github.com/repos/", ""),
    created_at: p.created_at,
  }));
}

export async function getUser(args: ToolArgs = {}) {
  const username = asString(args.username);
  if (!username && !token()) {
    throw new Error("GITHUB_TOKEN required for getUser without username");
  }
  const path = username
    ? `/users/${encodeURIComponent(username)}`
    : "/user";
  const u = await gh<User>(path);
  return {
    login: u.login,
    name: u.name,
    avatar_url: u.avatar_url,
    url: u.html_url,
    bio: u.bio,
    public_repos: u.public_repos,
    followers: u.followers,
  };
}

export const githubTools = {
  "github.listRepos": listRepos,
  "github.listIssues": listIssues,
  "github.listPRs": listPRs,
  "github.getUser": getUser,
} as const;

export type GitHubToolName = keyof typeof githubTools;

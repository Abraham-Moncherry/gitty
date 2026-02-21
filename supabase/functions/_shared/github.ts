const GITHUB_API = "https://api.github.com"
const GITHUB_GRAPHQL = "https://api.github.com/graphql"

export class GitHubError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export interface GitHubEvent {
  id: string
  type: string
  repo: { name: string }
  payload: {
    commits?: Array<{ sha: string; message: string; author: { name: string } }>
  }
  created_at: string
}

export async function fetchUserEvents(
  username: string,
  token: string
): Promise<GitHubEvent[]> {
  const res = await fetch(
    `${GITHUB_API}/users/${username}/events?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Gitty-Extension",
      },
    }
  )

  if (res.status === 401) {
    throw new GitHubError("GitHub token expired", 401)
  }
  if (res.status === 403) {
    const remaining = res.headers.get("X-RateLimit-Remaining")
    throw new GitHubError(
      `GitHub API rate limited (remaining: ${remaining})`,
      429
    )
  }
  if (!res.ok) {
    throw new GitHubError(`GitHub API error: ${res.status}`, res.status)
  }

  return res.json()
}

export async function fetchContributionsGraphQL(
  username: string,
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "Gitty-Extension",
    },
    body: JSON.stringify({ query, variables }),
  })

  if (res.status === 401) {
    throw new GitHubError("GitHub token expired", 401)
  }
  if (!res.ok) {
    throw new GitHubError(`GitHub GraphQL error: ${res.status}`, res.status)
  }

  const json = await res.json()
  if (json.errors) {
    throw new GitHubError(
      `GraphQL errors: ${json.errors.map((e: { message: string }) => e.message).join(", ")}`,
      422
    )
  }

  return json.data
}

import { createUserClient, createServiceClient } from "./supabase.ts"

export class AuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export interface AuthResult {
  userId: string
  githubUsername: string
  githubToken: string
  timezone: string
}

export async function authenticateAndGetGitHub(
  authHeader: string | null
): Promise<AuthResult> {
  if (!authHeader) {
    throw new AuthError("Missing authorization header", 401)
  }

  const userClient = createUserClient(authHeader)
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser()

  if (authError || !user) {
    throw new AuthError("Invalid token", 401)
  }

  // Get provider token via admin API
  const serviceClient = createServiceClient()
  const { data: adminUser, error: adminError } =
    await serviceClient.auth.admin.getUserById(user.id)

  if (adminError || !adminUser?.user) {
    throw new AuthError("Failed to retrieve user data", 500)
  }

  // GitHub provider token - try multiple locations
  const githubIdentity = adminUser.user.identities?.find(
    (i: { provider: string }) => i.provider === "github"
  )

  let githubToken: string | undefined =
    githubIdentity?.identity_data?.provider_token

  if (!githubToken) {
    githubToken = adminUser.user.user_metadata?.provider_token
  }

  if (!githubToken) {
    throw new AuthError("GitHub token not found - re-authenticate", 401)
  }

  // Get user profile from users table
  const { data: profile } = await serviceClient
    .from("users")
    .select("github_username, timezone")
    .eq("id", user.id)
    .single()

  return {
    userId: user.id,
    githubUsername:
      profile?.github_username ??
      githubIdentity?.identity_data?.user_name ??
      "",
    githubToken,
    timezone: profile?.timezone ?? "UTC",
  }
}

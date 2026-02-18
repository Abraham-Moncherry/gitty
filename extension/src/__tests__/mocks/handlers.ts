import { http, HttpResponse } from "msw"

const SUPABASE_URL = "https://test-project.supabase.co"

export const handlers = [
  http.get(`${SUPABASE_URL}/auth/v1/session`, () => {
    return HttpResponse.json({ user: null, session: null })
  }),

  http.get(`${SUPABASE_URL}/rest/v1/users`, () => {
    return HttpResponse.json([])
  }),

  http.get(`${SUPABASE_URL}/rest/v1/daily_commits`, () => {
    return HttpResponse.json([])
  }),

  http.get(`${SUPABASE_URL}/rest/v1/leaderboard_cache`, () => {
    return HttpResponse.json([])
  }),

  http.get(`${SUPABASE_URL}/rest/v1/badges`, () => {
    return HttpResponse.json([])
  }),

  http.get(`${SUPABASE_URL}/rest/v1/user_badges`, () => {
    return HttpResponse.json([])
  }),

  http.post(`${SUPABASE_URL}/functions/v1/sync-commits`, () => {
    return HttpResponse.json({ todayCommits: 0, currentStreak: 0 })
  })
]

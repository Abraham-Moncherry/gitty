import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { createServiceClient } from "../_shared/supabase.ts"
import { jsonResponse, errorResponse } from "../_shared/response.ts"
import { calculateLeaderboard } from "../_shared/leaderboard.ts"

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Verify authorization (service_role key)
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return errorResponse("Unauthorized", 401)
    }

    const serviceClient = createServiceClient()
    const allTimeRanks = await calculateLeaderboard(serviceClient)

    return jsonResponse({
      success: true,
      users: allTimeRanks.size,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("calculate-leaderboard error:", err)
    return errorResponse("Internal server error", 500)
  }
}

serve(handler)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { createServiceClient } from "../_shared/supabase.ts"
import { authenticateAndGetGitHub, AuthError } from "../_shared/auth.ts"
import { jsonResponse, errorResponse } from "../_shared/response.ts"

interface ManageFriendsBody {
  action: "send_request" | "accept_request" | "reject_request" | "remove_friend"
  friend_code?: string
  friendship_id?: string
  friend_id?: string
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const auth = await authenticateAndGetGitHub(
      req.headers.get("Authorization")
    )

    const body: ManageFriendsBody = await req.json()
    const serviceClient = createServiceClient()

    switch (body.action) {
      case "send_request": {
        if (!body.friend_code) {
          return errorResponse("friend_code is required", 400)
        }

        // Look up the addressee by friend_code
        const { data: addressee, error: lookupError } = await serviceClient
          .from("users")
          .select("id")
          .eq("friend_code", body.friend_code.toUpperCase())
          .single()

        if (lookupError || !addressee) {
          return errorResponse("Invalid friend code", 404)
        }

        if (addressee.id === auth.userId) {
          return errorResponse("Cannot add yourself as a friend", 400)
        }

        // Check if a friendship already exists (in either direction)
        const { data: existing } = await serviceClient
          .from("friendships")
          .select("id, status")
          .or(
            `and(requester_id.eq.${auth.userId},addressee_id.eq.${addressee.id}),` +
            `and(requester_id.eq.${addressee.id},addressee_id.eq.${auth.userId})`
          )
          .limit(1)
          .single()

        if (existing) {
          if (existing.status === "accepted") {
            return errorResponse("Already friends", 409)
          }
          if (existing.status === "pending") {
            return errorResponse("Friend request already pending", 409)
          }
        }

        // Create the friendship
        const { data: friendship, error: insertError } = await serviceClient
          .from("friendships")
          .insert({
            requester_id: auth.userId,
            addressee_id: addressee.id,
            status: "pending",
          })
          .select("id")
          .single()

        if (insertError) throw insertError

        // Queue a notification for the addressee
        await serviceClient.from("notification_queue").insert({
          user_id: addressee.id,
          type: "friend_request",
          title: "Friend request!",
          body: `${auth.githubUsername} wants to be your friend!`,
        })

        return jsonResponse({ success: true, friendship_id: friendship.id })
      }

      case "accept_request": {
        if (!body.friendship_id) {
          return errorResponse("friendship_id is required", 400)
        }

        // Verify the user is the addressee
        const { data: friendship, error: fetchError } = await serviceClient
          .from("friendships")
          .select("id, requester_id, addressee_id, status")
          .eq("id", body.friendship_id)
          .single()

        if (fetchError || !friendship) {
          return errorResponse("Friendship not found", 404)
        }

        if (friendship.addressee_id !== auth.userId) {
          return errorResponse("Only the addressee can accept a request", 403)
        }

        if (friendship.status !== "pending") {
          return errorResponse(`Request is already ${friendship.status}`, 409)
        }

        const { error: updateError } = await serviceClient
          .from("friendships")
          .update({ status: "accepted" })
          .eq("id", body.friendship_id)

        if (updateError) throw updateError

        // Check social badges for both users
        await checkSocialBadges(serviceClient, auth.userId)
        await checkSocialBadges(serviceClient, friendship.requester_id)

        return jsonResponse({ success: true })
      }

      case "reject_request": {
        if (!body.friendship_id) {
          return errorResponse("friendship_id is required", 400)
        }

        const { data: friendship, error: fetchError } = await serviceClient
          .from("friendships")
          .select("id, addressee_id, status")
          .eq("id", body.friendship_id)
          .single()

        if (fetchError || !friendship) {
          return errorResponse("Friendship not found", 404)
        }

        if (friendship.addressee_id !== auth.userId) {
          return errorResponse("Only the addressee can reject a request", 403)
        }

        if (friendship.status !== "pending") {
          return errorResponse(`Request is already ${friendship.status}`, 409)
        }

        const { error: updateError } = await serviceClient
          .from("friendships")
          .update({ status: "rejected" })
          .eq("id", body.friendship_id)

        if (updateError) throw updateError

        return jsonResponse({ success: true })
      }

      case "remove_friend": {
        if (!body.friend_id) {
          return errorResponse("friend_id is required", 400)
        }

        // Delete the friendship (either direction)
        const { error: deleteError, count } = await serviceClient
          .from("friendships")
          .delete({ count: "exact" })
          .eq("status", "accepted")
          .or(
            `and(requester_id.eq.${auth.userId},addressee_id.eq.${body.friend_id}),` +
            `and(requester_id.eq.${body.friend_id},addressee_id.eq.${auth.userId})`
          )

        if (deleteError) throw deleteError

        if (count === 0) {
          return errorResponse("Friendship not found", 404)
        }

        return jsonResponse({ success: true })
      }

      default:
        return errorResponse(
          "Invalid action. Use: send_request, accept_request, reject_request, remove_friend",
          400
        )
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.status)
    }
    console.error("manage-friends error:", err)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * Count accepted friendships and award social badges if thresholds are met.
 */
async function checkSocialBadges(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<void> {
  const { count } = await serviceClient
    .from("friendships")
    .select("id", { count: "exact", head: true })
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)

  const friendCount = count ?? 0

  const { data: socialBadges } = await serviceClient
    .from("badges")
    .select("id, requirement_value")
    .eq("requirement_type", "friends")

  for (const badge of socialBadges ?? []) {
    if (friendCount >= badge.requirement_value) {
      await serviceClient
        .from("user_badges")
        .upsert(
          { user_id: userId, badge_id: badge.id },
          { onConflict: "user_id,badge_id" }
        )
    }
  }
}

serve(handler)

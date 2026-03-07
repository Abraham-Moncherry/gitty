import { useState, useEffect, useCallback } from "react"
import { useAuth } from "~contexts/SupabaseAuthContext"
import { supabase } from "~lib/supabase"
import { Check, X, UserMinus } from "lucide-react"

interface FriendRequest {
  id: string
  requester_id: string
  github_username: string
  avatar_url: string | null
}

interface Friend {
  id: string
  friend_id: string
  github_username: string
  avatar_url: string | null
}

export function FriendsSection() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFriends = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Fetch incoming pending requests
    const { data: incoming } = await supabase
      .from("friendships")
      .select("id, requester_id, users!friendships_requester_id_fkey(github_username, avatar_url)")
      .eq("addressee_id", user.id)
      .eq("status", "pending")

    setRequests(
      (incoming ?? []).map((r: any) => ({
        id: r.id,
        requester_id: r.requester_id,
        github_username: r.users?.github_username ?? "",
        avatar_url: r.users?.avatar_url ?? null
      }))
    )

    // Fetch accepted friendships (both directions)
    const { data: accepted } = await supabase
      .from("friendships")
      .select(`
        id, requester_id, addressee_id,
        requester:users!friendships_requester_id_fkey(github_username, avatar_url),
        addressee:users!friendships_addressee_id_fkey(github_username, avatar_url)
      `)
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

    setFriends(
      (accepted ?? []).map((f: any) => {
        const isRequester = f.requester_id === user.id
        const other = isRequester ? f.addressee : f.requester
        return {
          id: f.id,
          friend_id: isRequester ? f.addressee_id : f.requester_id,
          github_username: other?.github_username ?? "",
          avatar_url: other?.avatar_url ?? null
        }
      })
    )

    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchFriends()
  }, [fetchFriends])

  async function handleAccept(friendshipId: string) {
    const { error } = await supabase.functions.invoke("manage-friends", {
      body: { action: "accept_request", friendship_id: friendshipId }
    })
    if (!error) fetchFriends()
  }

  async function handleReject(friendshipId: string) {
    const { error } = await supabase.functions.invoke("manage-friends", {
      body: { action: "reject_request", friendship_id: friendshipId }
    })
    if (!error) fetchFriends()
  }

  async function handleRemove(friendId: string) {
    const { error } = await supabase.functions.invoke("manage-friends", {
      body: { action: "remove_friend", friend_id: friendId }
    })
    if (!error) fetchFriends()
  }

  if (loading) {
    return (
      <p className="text-xs text-slate-light py-2">Loading friends...</p>
    )
  }

  return (
    <>
      {/* Incoming Friend Requests */}
      {requests.length > 0 && (
        <div className="mb-4">
          <label className="text-sm font-medium text-slate-text">
            Friend Requests ({requests.length})
          </label>
          <div className="space-y-2 mt-2">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center gap-2 p-2 bg-surface rounded-lg">
                {req.avatar_url ? (
                  <img
                    src={req.avatar_url}
                    className="w-7 h-7 rounded-full"
                    alt=""
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-slate-border" />
                )}
                <span className="flex-1 text-sm text-slate-text truncate">
                  @{req.github_username}
                </span>
                <button
                  onClick={() => handleAccept(req.id)}
                  className="p-1.5 text-accent hover:bg-green-50 rounded-md transition-colors"
                  title="Accept">
                  <Check size={14} />
                </button>
                <button
                  onClick={() => handleReject(req.id)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  title="Decline">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends List */}
      {friends.length > 0 && (
        <div className="mb-4">
          <label className="text-sm font-medium text-slate-text">
            Friends ({friends.length})
          </label>
          <div className="space-y-2 mt-2">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center gap-2 p-2 bg-surface rounded-lg">
                {friend.avatar_url ? (
                  <img
                    src={friend.avatar_url}
                    className="w-7 h-7 rounded-full"
                    alt=""
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-slate-border" />
                )}
                <span className="flex-1 text-sm text-slate-text truncate">
                  @{friend.github_username}
                </span>
                <button
                  onClick={() => handleRemove(friend.friend_id)}
                  className="p-1.5 text-slate-light hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  title="Remove friend">
                  <UserMinus size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {requests.length === 0 && friends.length === 0 && (
        <p className="text-xs text-slate-light py-2 mb-4">
          No friends yet. Share your friend code to connect!
        </p>
      )}
    </>
  )
}

import type { PoolClient } from "pg";

const IDLE_LOBBY_TIMEOUT_MINUTES = 5;

/**
 * Deletes a room and all associated state.
 * Idempotent — safe to call even if the room is already gone.
 * Must be called within an active transaction.
 */
export async function deleteRoom(client: PoolClient, roomId: string): Promise<void> {
  await client.query(
    `UPDATE battle_matches SET status = 'finished', ended_at = now()
     WHERE room_id = $1 AND status = 'in_game'`,
    [roomId]
  );
  await client.query(`DELETE FROM battle_room_players WHERE room_id = $1`, [roomId]);
  await client.query(`DELETE FROM battle_rooms WHERE id = $1`, [roomId]);
}

/**
 * Returns true if a lobby room has been idle past the inactivity timeout.
 */
export function isRoomExpired(createdAt: Date | string): boolean {
  const created = createdAt instanceof Date ? createdAt : new Date(String(createdAt));
  return Date.now() - created.getTime() > IDLE_LOBBY_TIMEOUT_MINUTES * 60 * 1000;
}

/**
 * Cleans up all stale lobby rooms system-wide:
 *   - Rooms idle for more than IDLE_LOBBY_TIMEOUT_MINUTES without starting
 *   - Orphaned rooms whose host is no longer in battle_room_players
 *
 * Must be called within an active transaction.
 * Uses SKIP LOCKED to avoid contention between concurrent cleanup calls.
 * Returns the number of rooms deleted.
 */
export async function cleanupStaleRooms(client: PoolClient): Promise<number> {
  const staleRes = await client.query<{ id: string }>(`
    SELECT r.id
    FROM battle_rooms r
    WHERE r.status = 'lobby'
      AND (
        r.created_at < NOW() - INTERVAL '${IDLE_LOBBY_TIMEOUT_MINUTES} minutes'
        OR NOT EXISTS (
          SELECT 1 FROM battle_room_players brp
          WHERE brp.room_id = r.id AND brp.user_id = r.host_user_id
        )
      )
    FOR UPDATE SKIP LOCKED
  `);

  for (const { id } of staleRes.rows) {
    await deleteRoom(client, id);
  }

  return staleRes.rows.length;
}

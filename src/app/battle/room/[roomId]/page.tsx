// src/app/battle/room/[roomId]/page.tsx
import RoomClient from "./RoomClient";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  // safety guard (prevents .slice crashes)
  if (!roomId) return null;

  return <RoomClient roomId={roomId} />;
}

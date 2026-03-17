// src/app/battle/room/[roomId]/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import RoomClient from "./RoomClient";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/auth");
  }
  const { roomId } = await params;
  if (!roomId) return null;
  return <RoomClient roomId={roomId} />;
}

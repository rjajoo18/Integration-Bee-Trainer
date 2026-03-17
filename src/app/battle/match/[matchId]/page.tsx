import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import MatchClient from "./MatchClient";

export default async function MatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/auth");
  }
  const { matchId } = await params;
  return <MatchClient matchId={matchId} />;
}

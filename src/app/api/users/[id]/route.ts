import { NextResponse } from "next/server";
import { Pool } from "pg";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const runtime = "nodejs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const viewerId = session?.user ? (session.user as any).id : null;

  const userId = Number(params.id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  // Fetch basic profile
  const userRes = await pool.query(
    `SELECT id, name, email, bio, is_public, image
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (userRes.rowCount === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const user = userRes.rows[0];

  // If private, only owner can view
  if (!user.is_public && viewerId !== userId) {
    return NextResponse.json({ error: "Profile is private" }, { status: 403 });
  }

  // Recent solves = recent updates in user_progress
  const solvesRes = await pool.query(
    `SELECT up.problem_id, up.is_solved, up.attempts, up.last_updated, ip.source
     FROM user_progress up
     LEFT JOIN integration_problems ip ON ip.id = up.problem_id
     WHERE up.user_id = $1
     ORDER BY up.last_updated DESC
     LIMIT 20`,
    [userId]
  );

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.is_public || viewerId === userId ? user.email : null, // hide email if public view
      bio: user.bio,
      isPublic: user.is_public,
      image: user.image,
    },
    recentSolves: solvesRes.rows,
  });
}

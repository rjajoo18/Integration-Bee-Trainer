import { NextResponse } from "next/server";
import { Pool } from "pg";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const runtime = "nodejs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  const result = await pool.query(
    `SELECT id, name, email, bio, is_public, image
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (result.rowCount === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(result.rows[0]);
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { name, bio, isPublic, image } = body as {
    name?: string;
    bio?: string;
    isPublic?: boolean;
    image?: string; // URL or data URL
  };

  // Basic guardrails
  if (typeof name === "string" && name.length > 80) {
    return NextResponse.json({ error: "Name too long" }, { status: 400 });
  }
  if (typeof bio === "string" && bio.length > 500) {
    return NextResponse.json({ error: "Bio too long (max 500)" }, { status: 400 });
  }
  if (typeof image === "string" && image.length > 1_000_000) {
    return NextResponse.json({ error: "Image too large" }, { status: 400 });
  }

  const result = await pool.query(
    `UPDATE users
     SET
       name = COALESCE($2, name),
       bio = COALESCE($3, bio),
       is_public = COALESCE($4, is_public),
       image = COALESCE($5, image)
     WHERE id = $1
     RETURNING id, name, email, bio, is_public, image`,
    [userId, name ?? null, bio ?? null, typeof isPublic === "boolean" ? isPublic : null, image ?? null]
  );

  return NextResponse.json(result.rows[0]);
}

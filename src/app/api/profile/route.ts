import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { pool } from "@/lib/db";

// Helper to sanitize BigInts
function sanitizeUser(user: any) {
  if (!user) return null;
  return {
    ...user,
    id: typeof user.id === 'bigint' ? Number(user.id) : user.id,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Try to find the user
    let result = await pool.query(
      `SELECT id, name, email, bio, is_public, image, username
       FROM users
       WHERE email = $1`,
      [session.user.email]
    );

    // 2. If user doesn't exist (e.g. Google Login), CREATE them now
    if (result.rows.length === 0) {
      console.log("User not found in DB, creating new record for:", session.user.email);
      
      const insertResult = await pool.query(
        `INSERT INTO users (email, name, image, is_public)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, bio, is_public, image, username`,
        [
          session.user.email, 
          session.user.name || "New User", 
          session.user.image || null,
          true // Default is_public to true
        ]
      );
      result = insertResult;
    }

    return NextResponse.json(sanitizeUser(result.rows[0]));
  } catch (error) {
    console.error("Profile Fetch Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function normalizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "").trim();
}

function validateUsername(u: string): string | null {
  if (!u) return "Username is required";
  if (u.length < 3) return "Username must be at least 3 characters";
  if (u.length > 20) return "Username must be at most 20 characters";
  if (!/^[a-z0-9_]+$/.test(u)) return "Username may only contain lowercase letters, numbers, and underscores";
  return null;
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, bio, isPublic, image } = body;

    // Handle username update if provided
    let usernameToSet: string | null = null;
    if (body.username !== undefined && body.username !== "") {
      usernameToSet = normalizeUsername(String(body.username));
      const usernameError = validateUsername(usernameToSet);
      if (usernameError) {
        return NextResponse.json({ error: usernameError }, { status: 400 });
      }

      // Check uniqueness — exclude the current user
      const conflict = await pool.query(
        "SELECT id FROM users WHERE username = $1 AND email != $2",
        [usernameToSet, session.user.email],
      );
      if (conflict.rows.length > 0) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
    }

    const query = `
      UPDATE users
      SET
        name     = COALESCE($1, name),
        bio      = COALESCE($2, bio),
        is_public = COALESCE($3, is_public),
        image    = COALESCE($4, image),
        username = COALESCE($5, username)
      WHERE email = $6
      RETURNING id, name, email, bio, is_public, image, username
    `;

    const values = [name, bio, isPublic, image, usernameToSet, session.user.email];
    const result = await pool.query(query, values);

    return NextResponse.json(sanitizeUser(result.rows[0]));
  } catch (error: any) {
    console.error("Profile Update Error:", error);
    return NextResponse.json({ error: error.message || "Failed to update" }, { status: 500 });
  }
}
import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { pool } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),

    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        const email = credentials.email.toLowerCase().trim();

        const result = await pool.query(
          "SELECT id, email, name, image, password, email_verified FROM users WHERE email = $1",
          [email],
        );
        const user = result.rows[0];

        if (!user || !user.password) {
          throw new Error("Invalid email or password");
        }

        const isValid = await compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error("Invalid email or password");
        }

        if (!user.email_verified) {
          throw new Error("EmailNotVerified");
        }

        return { id: String(user.id), email: user.email, name: user.name, image: user.image };
      },
    }),
  ],

  pages: {
    signIn: "/auth",
    error: "/auth",
  },

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async session({ session, token }) {
      if (token?.sub) {
        (session.user as any).id = token.sub;
      }

      if (session?.user?.email) {
        try {
          const result = await pool.query(
            "SELECT id, name, image, username FROM users WHERE email = $1",
            [session.user.email],
          );
          if (result.rows[0]) {
            (session.user as any).id = result.rows[0].id;
            session.user.name = result.rows[0].name;
            session.user.image = result.rows[0].image;
            (session.user as any).username = result.rows[0].username || null;
          }
        } catch (error) {
          console.error("Session Sync Error:", error);
        }
      }
      return session;
    },

    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.sub = String(user.id);
      }
      if (trigger === "update" && session) {
        return { ...token, ...session.user };
      }
      return token;
    },

    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        try {
          const existing = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [user.email],
          );

          if (existing.rows.length === 0) {
            // Google verifies the email, so create fully verified
            const newUser = await pool.query(
              `INSERT INTO users (email, name, image, is_public, email_verified)
               VALUES ($1, $2, $3, true, NOW())
               RETURNING id`,
              [user.email, user.name || "New User", user.image || null],
            );
            user.id = newUser.rows[0].id;
          } else {
            user.id = existing.rows[0].id;

            // If they previously registered via email but never verified,
            // Google's sign-in also serves as proof of email ownership
            await pool.query(
              `UPDATE users SET email_verified = NOW()
               WHERE email = $1 AND email_verified IS NULL`,
              [user.email],
            );
          }
        } catch (error) {
          console.error("Google sign-in error:", error);
          return false;
        }
      }
      return true;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

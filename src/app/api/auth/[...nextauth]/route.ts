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
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        const result = await pool.query("SELECT * FROM users WHERE email = $1", [
          credentials.email,
        ]);
        const user = result.rows[0];

        if (!user || !user.password) {
          throw new Error("No user found");
        }

        const isValid = await compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error("Invalid password");
        }

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      }
    }),
  ],
  pages: {
    signIn: '/auth',
    error: '/auth',
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token }) {
      // Add user ID to session
      if (token?.sub) {
        (session.user as any).id = token.sub;
      }

      if (session?.user?.email) {
        try {
          const result = await pool.query(
            "SELECT id, name, image FROM users WHERE email = $1", 
            [session.user.email]
          );
          
          if (result.rows[0]) {
            (session.user as any).id = result.rows[0].id;
            session.user.name = result.rows[0].name;
            session.user.image = result.rows[0].image;
          }
        } catch (error) {
          console.error("Session Sync Error:", error);
        }
      }
      return session;
    },
    async jwt({ token, user, trigger, session }) {
      // Store user ID in token on initial sign in
      if (user) {
        token.sub = String(user.id);
      }

      // Allow client-side updates
      if (trigger === "update" && session) {
        return { ...token, ...session.user };
      }

      return token;
    },
    async signIn({ user, account, profile }) {
      // For Google OAuth, ensure user exists in database
      if (account?.provider === "google" && user.email) {
        try {
          const existing = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [user.email]
          );

          if (existing.rows.length === 0) {
            // Create user if doesn't exist
            const newUser = await pool.query(
              "INSERT INTO users (email, name, image, is_public) VALUES ($1, $2, $3, true) RETURNING id",
              [user.email, user.name || "New User", user.image || null]
            );
            user.id = newUser.rows[0].id;
          } else {
            user.id = existing.rows[0].id;
          }
        } catch (error) {
          console.error("Sign in error:", error);
          return false;
        }
      }
      return true;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
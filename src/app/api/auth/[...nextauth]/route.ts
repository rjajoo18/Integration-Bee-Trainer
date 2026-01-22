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
  // 👇 THIS IS THE NEW PART THAT FIXES THE NAVBAR
  callbacks: {
    async session({ session, token }) {
      if (session?.user?.email) {
        // Every time the session is checked, grab the LATEST image from the DB
        // This ensures the Navbar updates immediately after you save.
        try {
          const result = await pool.query(
            "SELECT name, image FROM users WHERE email = $1", 
            [session.user.email]
          );
          
          if (result.rows[0]) {
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
      // Allow client-side updates (like your save() function) to update the token immediately
      if (trigger === "update" && session) {
        return { ...token, ...session.user };
      }
      // Initial sign in
      if (user) {
        return { ...token, ...user };
      }
      return token;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
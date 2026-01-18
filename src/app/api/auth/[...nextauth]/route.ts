import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { Pool } from "pg";
import bcrypt from "bcrypt";

export const runtime = "nodejs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const res = await pool.query("SELECT * FROM users WHERE email = $1", [
          credentials.email,
        ]);
        const user = res.rows[0];

        if (!user || !user.password) throw new Error("No user found");

        const ok = await bcrypt.compare(credentials.password, user.password);
        if (!ok) throw new Error("Incorrect password");

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],

  callbacks: {
  async jwt({ token, user, account, profile }) {
    // If credentials login, you already have user.id
    if (user) (token as any).id = (user as any).id;

    // If Google OAuth login, ensure a users row exists and attach its id
    if (account?.provider === "google") {
      const email = token.email;
      if (email) {
        const name = token.name ?? null;
        const image = token.picture ?? null;

        // Upsert user by email and fetch id
        const res = await pool.query(
          `
          INSERT INTO users (email, name, image)
          VALUES ($1, $2, $3)
          ON CONFLICT (email)
          DO UPDATE SET
            name = COALESCE(EXCLUDED.name, users.name),
            image = COALESCE(EXCLUDED.image, users.image)
          RETURNING id;
          `,
          [email, name, image]
        );

        (token as any).id = res.rows[0].id;
      }
    }

    return token;
  },

  async session({ session, token }) {
    if (session.user) (session.user as any).id = (token as any).id;
    return session;
  },
},


  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

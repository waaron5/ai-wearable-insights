import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import PostgresAdapter from "@auth/pg-adapter";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    newUser: "/onboarding",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        try {
          const result = await pool.query(
            'SELECT id, email, name, hashed_password, "onboarded_at" FROM users WHERE email = $1',
            [email]
          );

          const user = result.rows[0];
          if (!user || !user.hashed_password) {
            return null;
          }

          const isValid = await bcrypt.compare(password, user.hashed_password);
          if (!isValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            onboardedAt: user.onboarded_at,
          };
        } catch {
          console.error("Auth error during login");
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.onboardedAt = (user as unknown as Record<string, unknown>).onboardedAt as string | null;
      }
      // When updateSession() is called from the client with new data, persist it into the token
      if (trigger === "update" && session?.onboardedAt) {
        token.onboardedAt = session.onboardedAt as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as unknown as Record<string, unknown>).onboardedAt = token.onboardedAt as string | null;
      }
      return session;
    },
  },
});

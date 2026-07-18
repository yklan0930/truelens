import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt", // Required for Credentials provider
  },
  pages: {
    signIn: "/", // Use modal instead of separate page
  },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Credentials({
      name: "email",
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

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) {
          // User doesn't exist or uses OAuth only
          return null;
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          isAdmin: user.isAdmin,
          plan: user.plan,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        const u = user as { isAdmin?: boolean; plan?: string };
        if (typeof u.isAdmin === "boolean") token.isAdmin = u.isAdmin;
        if (u.plan) token.plan = u.plan;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        // Explicitly typed to bypass next-auth v5 DefaultSession intersection quirks.
        const su = session.user as {
          id: string;
          isAdmin?: boolean;
          plan?: string;
        };
        su.id = token.id as string;
        // Prefer token values; refresh from DB when available (role may change).
        // Note: next-auth v5 types token.* as {} via its Record index signature,
        // so we guard with typeof rather than `?? default`.
        let isAdmin: boolean = false;
        let plan: string = "free";
        if (typeof token.isAdmin === "boolean") isAdmin = token.isAdmin;
        if (typeof token.plan === "string") plan = token.plan;
        try {
          const u = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { isAdmin: true, plan: true },
          });
          if (u) {
            if (typeof u.isAdmin === "boolean") isAdmin = u.isAdmin;
            if (typeof u.plan === "string") plan = u.plan;
          }
        } catch {
          // DB unavailable — fall back to token values
        }
        su.isAdmin = isAdmin;
        su.plan = plan;
      }
      return session;
    },
  },
});

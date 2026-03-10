import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
      onboardedAt: string | null;
    };
  }

  interface User {
    onboardedAt?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    onboardedAt: string | null;
  }
}

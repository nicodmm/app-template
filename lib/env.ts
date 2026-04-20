import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    META_APP_ID: z.string().min(1),
    META_APP_SECRET: z.string().min(1),
    META_OAUTH_REDIRECT_URI: z.string().url(),
    CRM_STATE_SECRET: z.string().min(32),
    PIPEDRIVE_CLIENT_ID: z.string().min(1),
    PIPEDRIVE_CLIENT_SECRET: z.string().min(1),
    PIPEDRIVE_REDIRECT_URI: z.string().url(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_OAUTH_REDIRECT_URI: process.env.META_OAUTH_REDIRECT_URI,
    CRM_STATE_SECRET: process.env.CRM_STATE_SECRET,
    PIPEDRIVE_CLIENT_ID: process.env.PIPEDRIVE_CLIENT_ID,
    PIPEDRIVE_CLIENT_SECRET: process.env.PIPEDRIVE_CLIENT_SECRET,
    PIPEDRIVE_REDIRECT_URI: process.env.PIPEDRIVE_REDIRECT_URI,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});

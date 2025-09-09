// Server-side Supabase client using service key (DO NOT expose service key to browser)
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const serviceUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY; // service_role key

export const supabaseAdmin = createClient(serviceUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

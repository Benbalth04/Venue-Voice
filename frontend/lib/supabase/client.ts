import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

if (!supabaseUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL environment variable",
  )
}
else if (!supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY environment variable",
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)


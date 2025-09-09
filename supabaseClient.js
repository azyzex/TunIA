// Supabase client (browser-side) factory
// Expects Vite env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env vars missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Convenience API wrappers (can expand later)
export async function ensureProfile(user) {
  if (!user) return;
  await supabase.from('profiles').upsert({
    user_id: user.id,
    display_name: user.email?.split('@')[0] || 'user'
  }, { onConflict: 'user_id' });
}

export async function createConversation(userId, title = null) {
  const { data, error } = await supabase.from('conversations').insert({ user_id: userId, title }).select().single();
  if (error) throw error;
  return data;
}

export async function addUserMessage(conversationId, userId, text) {
  const { data, error } = await supabase.from('messages').insert({ conversation_id: conversationId, user_id: userId, role: 'user', text }).select().single();
  if (error) throw error;
  return data;
}

export async function addAIMessage(conversationId, text, meta = {}) {
  const { data, error } = await supabase.from('messages').insert({ conversation_id: conversationId, user_id: null, role: 'ai', text, meta }).select().single();
  if (error) throw error;
  return data;
}

export async function fetchConversationMessages(conversationId) {
  const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

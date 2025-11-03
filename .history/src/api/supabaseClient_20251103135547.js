import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    })
  : null;

// Optional helpers for annotations table
// Table: public.annotations (id uuid pk, reference_id text, page_number int, type text, color text, content text, position jsonb, base_size jsonb, created_at timestamptz, updated_at timestamptz)
export async function upsertAnnotation(row) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase
    .from("annotations")
    .upsert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listAnnotationsByReference(referenceId) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase
    .from("annotations")
    .select("*")
    .eq("reference_id", referenceId)
    .order("page_number", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function deleteAnnotationById(id) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("annotations").delete().eq("id", id);
  if (error) throw error;
  return true;
}

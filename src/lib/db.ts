import { supabase } from "@/auth/supabaseClient";
import type { Tables } from "@/lib/database.types";

/** Profile row inferred from Supabase schema */
export type Profile = Tables<"profiles">;

/** Provincia row inferred from Supabase schema */
export type Provincia = Tables<"provincias">;

/** Profile joined with provincia name */
export type ProfileWithProvince = Profile & {
  provincias: Pick<Provincia, "nombre"> | null;
};

/** Fetch all profiles with their province name */
export async function fetchAllProfiles(): Promise<ProfileWithProvince[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, avatar_url, username, provincia_id, updated_at, provincias(nombre)",
    )
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error cargando profiles:", error.message);
    return [];
  }

  // Supabase returns FK joins as arrays; normalize to single object
  return ((data ?? []) as unknown as ProfileWithProvince[]).map((p) => ({
    ...p,
    provincias: Array.isArray(p.provincias)
      ? (p.provincias[0] ?? null)
      : p.provincias,
  }));
}

/** Fetch current user's profile */
export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error cargando perfil:", error.message);
    return null;
  }
  return data;
}

/** Fetch province ID by name */
export async function fetchProvinciaIdByName(
  nombre: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("provincias")
    .select("id")
    .eq("nombre", nombre)
    .single();

  if (error) {
    console.error("Error buscando provincia:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/** Upsert province for current user */
export async function setUserProvince(
  userId: string,
  provinciaId: number,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("profiles")
    .update({ provincia_id: provinciaId, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/** Delete current user's profile row and sign out */
export async function deleteMyAccount(): Promise<{
  success: boolean;
  error?: string;
}> {
  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "No hay sesión activa" };
  }

  // Delete profile row (cascade or RLS should handle related data)
  const { error: profileError } = await supabase
    .from("profiles")
    .delete()
    .eq("id", user.id);

  if (profileError) {
    return { success: false, error: profileError.message };
  }

  // Sign out to clear session
  await supabase.auth.signOut();

  return { success: true };
}

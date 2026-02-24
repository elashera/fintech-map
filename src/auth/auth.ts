import { supabase } from "./supabaseClient";

export const loginWithX = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "x",
    options: { redirectTo: window.location.origin },
  });
  if (error) {
    console.error("Error al iniciar sesión:", error.message);
  }
};

export const handleSignOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Error al cerrar sesión:", error.message);
  }
  window.location.reload();
};

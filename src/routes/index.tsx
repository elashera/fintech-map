import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/auth/supabaseClient";
import { Header } from "@/components/Header";
import { SpainMap } from "@/components/SpainMap";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  fetchAllProfiles,
  fetchProvinciaIdByName,
  setUserProvince,
  type ProfileWithProvince,
} from "@/lib/db";

export const Route = createFileRoute("/")({ component: App });

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileWithProvince[]>([]);
  const [myProvince, setMyProvince] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingProvince, setPendingProvince] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load all profiles (public)
  const loadProfiles = useCallback(async () => {
    const data = await fetchAllProfiles();
    setProfiles(data);

    // Find current user's province
    if (session?.user?.id) {
      const mine = data.find((p) => p.id === session.user.id);
      setMyProvince(mine?.provincias?.nombre ?? null);
    }
  }, [session]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Province click handler
  const handleProvinceSelect = useCallback(
    (provinceName: string) => {
      if (!session) {
        toast.error("Inicia sesión para seleccionar tu provincia");
        return;
      }

      // If clicking the same province they're already in
      if (provinceName === myProvince) {
        toast.info("Ya estás en esta provincia");
        return;
      }

      setPendingProvince(provinceName);
      setConfirmOpen(true);
    },
    [session, myProvince],
  );

  // Confirm province change
  const handleConfirmProvince = useCallback(async () => {
    if (!session?.user?.id || !pendingProvince) return;

    setSaving(true);
    const provinciaId = await fetchProvinciaIdByName(pendingProvince);

    if (!provinciaId) {
      toast.error(
        `No se encontró la provincia "${pendingProvince}" en la base de datos`,
      );
      setSaving(false);
      setConfirmOpen(false);
      return;
    }

    const result = await setUserProvince(session.user.id, provinciaId);

    if (result.success) {
      setMyProvince(pendingProvince);
      toast.success(`Te has ubicado en ${pendingProvince}`);
      await loadProfiles(); // Refresh all
    } else {
      toast.error(`Error: ${result.error}`);
    }

    setSaving(false);
    setConfirmOpen(false);
    setPendingProvince(null);
  }, [session, pendingProvince, loadProfiles]);

  if (loading) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <p className='text-muted-foreground text-lg'>Cargando...</p>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background flex flex-col'>
      <Header session={session} />

      <main className='flex-1 relative'>
        {myProvince && (
          <div className='absolute bottom-3 right-3 map-overlay'>
            <Badge className='text-sm px-3 py-1.5 shadow-lg'>
              Tu provincia: {myProvince}
            </Badge>
          </div>
        )}

        <SpainMap
          selectedProvince={myProvince}
          onProvinceSelect={handleProvinceSelect}
          profiles={profiles}
          dialogOpen={confirmOpen}
        />
      </main>

      {/* Footer */}
      <footer className='absolute bottom-1 left-2 map-overlay flex items-center gap-3'>
        <p className='text-[10px] text-muted-foreground/50'>
          Hecho por MichaelBed con ❤️
        </p>
        <Link
          to='/privacy'
          className='text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors underline underline-offset-2'>
          Política de Privacidad
        </Link>
      </footer>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {myProvince ? "Cambiar de provincia" : "Seleccionar provincia"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {myProvince
                ? `¿Quieres cambiar de ${myProvince} a ${pendingProvince}?`
                : `¿Quieres ubicarte en ${pendingProvince}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmProvince} disabled={saving}>
              {saving ? "Guardando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

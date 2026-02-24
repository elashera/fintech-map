import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { loginWithX, handleSignOut } from "@/auth/auth";
import { deleteMyAccount } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { LogOut, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";

interface HeaderProps {
  session: Session | null;
}

export function Header({ session }: HeaderProps) {
  const user = session?.user;
  const name = user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? "";
  const avatarUrl =
    user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? "";

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    const result = await deleteMyAccount();
    if (result.success) {
      toast.success("Tu cuenta ha sido eliminada");
      window.location.reload();
    } else {
      toast.error(`Error: ${result.error}`);
    }
    setDeleting(false);
    setDeleteOpen(false);
  };

  return (
    <header className='relative z-[1000] flex items-center justify-between px-6 py-3 border-b border-border bg-card'>
      <Link to='/'>
        <h1 className='text-xl font-bold text-foreground tracking-tight'>FinXMap</h1>
      </Link>

      {session ? (
        <div className='flex items-center gap-3'>
          {/* Avatar with dropdown for privacy + delete */}
          <div className='relative'>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className='flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card'>
              <Avatar className='h-8 w-8 cursor-pointer'>
                <AvatarImage src={avatarUrl} alt={name} />
                <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className='text-sm font-medium text-foreground hidden sm:inline'>
                {name}
              </span>
            </button>

            {menuOpen && (
              <>
                <div
                  className='fixed inset-0 z-[1001]'
                  onClick={() => setMenuOpen(false)}
                />
                <div className='absolute right-0 top-full mt-2 z-[1002] w-52 rounded-lg border border-border bg-card shadow-xl py-1'>
                  <Link
                    to='/privacy'
                    onClick={() => setMenuOpen(false)}
                    className='flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors'>
                    <Shield className='h-4 w-4 text-muted-foreground' />
                    Política de Privacidad
                  </Link>
                  <div className='border-t border-border my-1' />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteOpen(true);
                    }}
                    className='flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors'>
                    <Trash2 className='h-4 w-4' />
                    Eliminar mi cuenta
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Logout button — always visible */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant='ghost' size='icon' onClick={handleSignOut}>
                <LogOut className='h-4 w-4' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Cerrar sesión</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <div className='flex items-center gap-3'>
          <Link to='/privacy'>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant='ghost' size='icon'>
                  <Shield className='h-4 w-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Política de Privacidad</TooltipContent>
            </Tooltip>
          </Link>
          <Button onClick={loginWithX} className='gap-2'>
            <svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'>
              <path d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' />
            </svg>
            Iniciar sesión con X
          </Button>
        </div>
      )}

      {/* Delete account confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tu cuenta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán todos tus datos (perfil, provincia seleccionada) de forma
              permanente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleting}
              className='bg-destructive text-white hover:bg-destructive/90'>
              {deleting ? "Eliminando..." : "Sí, eliminar mi cuenta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}

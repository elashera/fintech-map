import type { Session } from "@supabase/supabase-js";
import { loginWithX, handleSignOut } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LogOut } from "lucide-react";

interface HeaderProps {
  session: Session | null;
}

export function Header({ session }: HeaderProps) {
  const user = session?.user;
  const name = user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? "";
  const avatarUrl =
    user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? "";

  return (
    <header className='flex items-center justify-between px-6 py-3 border-b border-border bg-card'>
      <h1 className='text-xl font-bold text-foreground tracking-tight'>FinXMap</h1>

      {session ? (
        <div className='flex items-center gap-3'>
          <Avatar className='h-8 w-8'>
            <AvatarImage src={avatarUrl} alt={name} />
            <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className='text-sm font-medium text-foreground hidden sm:inline'>
            {name}
          </span>
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
        <Button onClick={loginWithX} className='gap-2'>
          <svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'>
            <path d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' />
          </svg>
          Iniciar sesión con X
        </Button>
      )}
    </header>
  );
}

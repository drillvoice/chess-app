import { Link, useLocation } from 'wouter';
import { Home, TrendingUp, User as UserIcon, Info as InfoIcon, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/activity', label: 'Activity', icon: TrendingUp },
    { path: '/otb', label: 'OTB', icon: Crown },
    { path: '/account', label: 'Settings', icon: UserIcon },
    { path: '/info', label: 'Info', icon: InfoIcon },
  ];

  return (
    <header className="bg-[#1E40AF] px-2 py-2 text-white shadow-md sm:px-3 sm:py-3 md:px-6 md:py-5">
      <div className="mx-auto w-full max-w-[1240px]">
        <div className="flex items-center gap-2 md:gap-3">
          <Link href="/" aria-label="Go to Home" className="hidden sm:block">
            <img
              src="/icon-192x192.png"
              alt="Pawn Star Chess Log"
              className="h-9 w-9 shrink-0 rounded-lg sm:h-10 sm:w-10"
            />
          </Link>
          <nav className="min-w-0 flex-1">
            <div className="flex min-w-0 gap-1 overflow-hidden rounded-lg bg-blue-800 p-1 md:p-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;

                return (
                  <Link key={item.path} href={item.path}>
                    <button
                      aria-label={item.label}
                      className={cn(
                        'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1 py-2 text-[10px] font-medium leading-none transition-colors sm:gap-2 sm:px-3 sm:text-sm md:px-5 md:py-2.5',
                        isActive ? 'bg-white text-[#1E40AF]' : 'text-white hover:bg-blue-700',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="block truncate text-center sm:text-left">{item.label}</span>
                    </button>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}

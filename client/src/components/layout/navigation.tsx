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
    <header className="bg-[#1E40AF] px-3 py-3 text-white shadow-md md:px-6 md:py-5">
      <div className="mx-auto w-full max-w-[1240px]">
        <div className="flex items-center gap-2 md:gap-3">
          <Link href="/" aria-label="Go to Home">
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
                        'flex min-w-0 flex-1 items-center justify-center gap-0 rounded-md px-1.5 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-3 sm:text-sm md:px-5 md:py-2.5',
                        isActive ? 'bg-white text-[#1E40AF]' : 'text-white hover:bg-blue-700',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline">{item.label}</span>
                      <span className="sr-only sm:hidden">{item.label}</span>
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

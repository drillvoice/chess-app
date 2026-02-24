import { Link, useLocation } from 'wouter';
import { Home, TrendingUp, User as UserIcon, Info as InfoIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/activity', label: 'Activity', icon: TrendingUp },
    { path: '/account', label: 'Account', icon: UserIcon },
    { path: '/info', label: 'Info', icon: InfoIcon },
  ];

  return (
    <header className="bg-[#1E40AF] px-4 py-4 text-white shadow-md md:px-6 md:py-5">
      <div className="mx-auto w-full max-w-[1240px]">
        <h1 className="text-center text-xl font-semibold md:text-2xl">Pawn Star chess log</h1>
        <nav className="mt-4">
          <div className="flex space-x-1 rounded-lg bg-blue-800 p-1 md:p-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;

              return (
                <Link key={item.path} href={item.path}>
                  <button
                    className={cn(
                      'flex flex-1 items-center justify-center space-x-2 rounded-md px-3 py-2 text-sm font-medium transition-colors md:px-5 md:py-2.5',
                      isActive ? 'bg-white text-[#1E40AF]' : 'text-white hover:bg-blue-700',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}

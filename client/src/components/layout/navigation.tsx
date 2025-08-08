import { Link, useLocation } from "wouter";
import { Home, TrendingUp, User as UserIcon, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { path: "/", label: "Home", icon: Home },
    { path: "/activity", label: "Activity", icon: TrendingUp },
    { path: "/account", label: "Account", icon: UserIcon },
    { path: "/info", label: "Info", icon: Info },
  ];

  return (
    <header className="bg-[#1E40AF] text-white p-4 shadow-md">
      <h1 className="text-xl font-semibold text-center">Pawn Star Chess Log</h1>
      <nav className="mt-4">
        <div className="flex space-x-1 bg-blue-800 rounded-lg p-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            
            return (
              <Link key={item.path} href={item.path}>
                <button
                  className={cn(
                    "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center space-x-2",
                    isActive
                      ? "bg-white text-[#1E40AF]"
                      : "text-white hover:bg-blue-700"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

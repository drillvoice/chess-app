import { Link } from 'wouter';
import { cn } from '@/lib/utils';

/** Switch between free practice and the campaign. */
export default function FocusModeTabs({ active }: { active: 'practice' | 'campaign' }) {
  const tab = (href: string, label: string, isActive: boolean) => (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900',
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-1">
      {tab('/focus', 'Free practice', active === 'practice')}
      {tab('/focus/campaign', 'Campaign', active === 'campaign')}
    </div>
  );
}

import { Puzzle, Crown, Book, Clock, Target } from 'lucide-react';
import { formatStudyDisplay } from '@/lib/utils';
import { normalizeStudyTagKey, type TrainingSession } from '@shared/schema';

// --- Helper functions (pure) ---

export function getSessionIcon(type: string) {
  switch (type) {
    case 'tactics':
      return <Puzzle className="h-5 w-5 text-[#1E40AF]" />;
    case 'game':
      return <Crown className="h-5 w-5 text-[#059669]" />;
    case 'study':
      return <Book className="h-5 w-5 text-[#F59E0B]" />;
    case 'goal':
      return <Target className="h-5 w-5 text-purple-600" />;
    default:
      return <Clock className="h-5 w-5 text-gray-500" />;
  }
}

export function getSessionBgColor(type: string) {
  switch (type) {
    case 'tactics':
      return 'bg-blue-100';
    case 'game':
      return 'bg-emerald-100';
    case 'study':
      return 'bg-amber-100';
    case 'goal':
      return 'bg-purple-100';
    default:
      return 'bg-gray-100';
  }
}

function parseStudyTags(session: TrainingSession): string[] {
  if (!session.studyTags) return [];
  if (Array.isArray(session.studyTags)) return session.studyTags as string[];
  if (typeof session.studyTags === 'string') {
    try {
      const parsed = JSON.parse(session.studyTags);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getStudyUnitLabel(
  session: TrainingSession,
  studyUnitLabelByTag: Record<string, string>,
): string | null {
  if (!session.primaryStudyTag) return null;
  return studyUnitLabelByTag[normalizeStudyTagKey(session.primaryStudyTag)] || null;
}

export function getSessionTitle(
  session: TrainingSession,
  studyUnitLabelByTag: Record<string, string> = {},
) {
  switch (session.type) {
    case 'tactics':
      return 'Tactics Practice';
    case 'game':
      return session.opponentUsername ? `Game v ${session.opponentUsername}` : 'Chess Game';
    case 'study': {
      const tags = parseStudyTags(session);
      const baseTitle = tags.length > 0 ? `Study: ${tags.join(', ')}` : formatStudyDisplay(session);
      if (typeof session.quantity === 'number' && session.quantity > 0) {
        const unitLabel = getStudyUnitLabel(session, studyUnitLabelByTag) || 'units';
        const tagLabel = session.primaryStudyTag ? ` · ${session.primaryStudyTag}` : '';
        return `${baseTitle} (${session.quantity} ${unitLabel}${tagLabel})`;
      }
      return baseTitle;
    }
    case 'goal':
      return session.goalTitle || 'Weekly Goal';
    default:
      return 'Training Session';
  }
}

export function getSessionSubtitle(
  session: TrainingSession,
  studyUnitLabelByTag: Record<string, string> = {},
) {
  switch (session.type) {
    case 'tactics':
      return session.pointsGained != null
        ? `${session.pointsGained > 0 ? '+' : ''}${session.pointsGained} points • ${session.duration} min`
        : `${session.duration} min`;
    case 'game':
      return `${session.gameResult?.charAt(0).toUpperCase()}${session.gameResult?.slice(1)} as ${session.playerColor} • ${session.platform}${session.timeControl ? ` ${session.timeControl}` : ''}`;
    case 'study': {
      const quantitySuffix =
        typeof session.quantity === 'number' && session.quantity > 0
          ? ` • ${session.quantity} ${getStudyUnitLabel(session, studyUnitLabelByTag) || 'units'}${session.primaryStudyTag ? ` (${session.primaryStudyTag})` : ''}`
          : '';
      return session.studyNotes
        ? `${session.studyNotes} • ${session.duration} min${quantitySuffix}`
        : `${session.duration} min${quantitySuffix}`;
    }
    case 'goal':
      return session.goalDescription || 'Weekly focus area';
    default:
      return '';
  }
}

export function getSessionValue(session: TrainingSession) {
  switch (session.type) {
    case 'tactics':
      return session.finalScore?.toString() || '';
    case 'game':
      return session.gameResult === 'win' ? 'W' : session.gameResult === 'draw' ? 'D' : 'L';
    case 'study':
      return '';
    case 'goal':
      return '🎯';
    default:
      return '';
  }
}

export function getSessionValueColor(session: TrainingSession) {
  switch (session.type) {
    case 'tactics':
      return 'text-gray-800';
    case 'game':
      return session.gameResult === 'win'
        ? 'text-green-600'
        : session.gameResult === 'draw'
          ? 'text-gray-600'
          : 'text-red-600';
    case 'study':
      return 'text-gray-800';
    case 'goal':
      return 'text-purple-600';
    default:
      return 'text-gray-800';
  }
}

export function formatDate(date: string | Date) {
  const d = new Date(date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffTime = today.getTime() - sessionDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

export function groupSessionsByDate(sessions: TrainingSession[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const todaySessions: TrainingSession[] = [];
  const yesterdaySessions: TrainingSession[] = [];
  const last7DaysSessions: TrainingSession[] = [];
  const last30DaysSessions: TrainingSession[] = [];
  const earlierSessions: TrainingSession[] = [];

  sessions.forEach((session) => {
    const sessionDate = new Date(session.date);
    const sessionDay = new Date(
      sessionDate.getFullYear(),
      sessionDate.getMonth(),
      sessionDate.getDate(),
    );
    const diffTime = today.getTime() - sessionDay.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      todaySessions.push(session);
    } else if (diffDays === 1) {
      yesterdaySessions.push(session);
    } else if (diffDays < 7) {
      last7DaysSessions.push(session);
    } else if (diffDays < 30) {
      last30DaysSessions.push(session);
    } else {
      earlierSessions.push(session);
    }
  });

  return {
    todaySessions,
    yesterdaySessions,
    last7DaysSessions,
    last30DaysSessions,
    earlierSessions,
  };
}

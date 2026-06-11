import { memo } from 'react';
import { Clock, Trash2, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { TrainingSession } from '@shared/schema';
import {
  getSessionIcon,
  getSessionBgColor,
  getSessionTitle,
  getSessionSubtitle,
  getSessionValue,
  getSessionValueColor,
  formatDate,
} from './session-display';

export const SessionCard = memo(function SessionCard({
  session,
  studyUnitLabelByTag,
  onEdit,
  onDelete,
}: {
  session: TrainingSession;
  studyUnitLabelByTag: Record<string, string>;
  onEdit: (session: TrainingSession) => void;
  onDelete: (sessionId: number) => void;
}) {
  const isPending = (session as any)._pending;

  return (
    <Card
      key={session.id}
      className={cn('shadow-sm', isPending ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200')}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full',
                isPending ? 'bg-blue-100' : getSessionBgColor(session.type),
              )}
            >
              {isPending ? (
                <Clock className="h-5 w-5 animate-pulse text-blue-600" />
              ) : (
                getSessionIcon(session.type)
              )}
            </div>
            <div>
              <div className={cn('font-semibold', isPending ? 'text-blue-700' : 'text-gray-800')}>
                {isPending ? 'Saving...' : getSessionTitle(session, studyUnitLabelByTag)}
              </div>
              <div className={cn('text-sm', isPending ? 'text-blue-600' : 'text-gray-600')}>
                {isPending ? (
                  `${session.duration} min study session`
                ) : (
                  <>
                    {getSessionSubtitle(session, studyUnitLabelByTag)}
                    {session.type === 'tactics' &&
                      (() => {
                        const attempted = session.puzzlesAttempted as any;
                        const correct = session.puzzlesCorrect as any;
                        const hasAttempted = attempted !== undefined && attempted !== null;
                        const hasCorrect = correct !== undefined && correct !== null;
                        if (hasAttempted || hasCorrect) {
                          const left = hasCorrect ? String(correct) : '-';
                          const right = hasAttempted ? String(attempted) : '-';
                          return <span>{` • ${left}/${right}`}</span>;
                        }
                        return null;
                      })()}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="text-right">
              <div
                className={cn(
                  'text-sm font-medium',
                  isPending ? 'text-blue-600' : getSessionValueColor(session),
                )}
              >
                {isPending ? '⏳' : getSessionValue(session)}
              </div>
              <div className="text-xs text-gray-500">{formatDate(session.date)}</div>
            </div>
            {!isPending && (
              <div className="flex space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Edit session"
                  className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                  onClick={() => onEdit(session)}
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Delete session"
                      className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Session</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this {session.type} session? This action
                        cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(session.id)}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

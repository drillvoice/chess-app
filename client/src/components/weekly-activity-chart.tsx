import React from 'react';
import { TrainingSession } from '@shared/schema';

interface ActivityBlock {
  type: 'tactics' | 'game' | 'study' | 'goal';
  duration: number;
  timeControl?: string;
}

interface DayData {
  day: string;
  blocks: ActivityBlock[];
  totalDuration: number;
}

interface WeeklyActivityChartProps {
  sessions: TrainingSession[];
}

// Game duration estimates based on time control
const getGameDuration = (timeControl?: string): number => {
  if (!timeControl) return 12; // Default to 10 minute estimate

  switch (timeControl) {
    case '5+3':
      return 7;
    case '10':
      return 12;
    case '10+5':
      return 18;
    case '15+10':
      return 25;
    default:
      return 12;
  }
};

// Color mapping for different activity types
const getActivityColor = (type: string): string => {
  switch (type) {
    case 'tactics':
      return '#1E40AF'; // Blue
    case 'game':
      return '#059669'; // Green
    case 'study':
      return '#F59E0B'; // Orange
    case 'goal':
      return '#9333EA'; // Purple
    default:
      return '#6B7280'; // Gray
  }
};

const WeeklyActivityChart: React.FC<WeeklyActivityChartProps> = ({ sessions }) => {
  const getDayData = (): DayData[] => {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekData: DayData[] = [];

    for (let i = 0; i < 7; i++) {
      const currentDay = new Date(startOfWeek);
      currentDay.setDate(startOfWeek.getDate() + i);

      const dayEnd = new Date(currentDay);
      dayEnd.setHours(23, 59, 59, 999);

      // Get sessions for this day, sorted by time
      const daySessions = sessions
        .filter((session) => {
          const sessionDate = new Date(session.date);
          return sessionDate >= currentDay && sessionDate <= dayEnd;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Convert sessions to activity blocks
      const blocks: ActivityBlock[] = daySessions.map((session) => {
        let duration = 0;

        if (session.type === 'game') {
          duration = getGameDuration(session.timeControl || undefined);
        } else if (session.type === 'tactics' || session.type === 'study') {
          duration = session.duration || 0;
        } else if (session.type === 'goal') {
          duration = 0; // Goals don't have duration
        }

        return {
          type: session.type as 'tactics' | 'game' | 'study' | 'goal',
          duration,
          timeControl: session.timeControl || undefined,
        };
      });

      const totalDuration = blocks.reduce((sum, block) => sum + block.duration, 0);

      weekData.push({
        day: dayNames[i],
        blocks,
        totalDuration,
      });
    }

    return weekData;
  };

  const weekData = getDayData();
  const maxDuration = Math.max(...weekData.map((d) => d.totalDuration), 1);

  return (
    <div className="space-y-4">
      <div className="flex h-32 items-end justify-between space-x-2">
        {weekData.map((dayData, dayIndex) => {
          // Scale column height to maximum value in the week (100% = highest column)
          const columnHeight =
            dayData.totalDuration > 0 ? (dayData.totalDuration / maxDuration) * 100 : 0;

          return (
            <div key={dayIndex} className="flex h-full flex-1 flex-col items-center">
              {/* Column container - scaled to fit available height */}
              <div className="mb-2 flex w-full flex-1 flex-col justify-end">
                <div
                  className="relative w-full transition-all duration-300"
                  style={{ height: `${columnHeight}%` }}
                >
                  {dayData.blocks.length > 0 ? (
                    <div className="flex h-full w-full flex-col-reverse overflow-hidden rounded-t">
                      {dayData.blocks.map((block, blockIndex) => {
                        const blockHeight =
                          block.duration > 0 ? (block.duration / dayData.totalDuration) * 100 : 0;
                        const color = getActivityColor(block.type);

                        return blockHeight > 0 ? (
                          <div
                            key={blockIndex}
                            className="flex-shrink-0 transition-all duration-300"
                            style={{
                              backgroundColor: color,
                              height: `${blockHeight}%`,
                              minHeight: '2px',
                            }}
                            title={`${block.type} - ${block.duration}m${block.timeControl ? ` (${block.timeControl})` : ''}`}
                          />
                        ) : null;
                      })}
                    </div>
                  ) : (
                    <div className="h-full w-full bg-transparent" />
                  )}
                </div>
              </div>

              {/* Day label */}
              <div className="text-xs text-gray-500">{dayData.day}</div>
            </div>
          );
        })}
      </div>

      {/* Color Legend */}
      <div className="flex flex-wrap justify-center gap-4 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: '#1E40AF' }}></div>
          <span>Tactics</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: '#059669' }}></div>
          <span>Games</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: '#F59E0B' }}></div>
          <span>Study</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: '#9333EA' }}></div>
          <span>Goals</span>
        </div>
      </div>
    </div>
  );
};

export default WeeklyActivityChart;

import React, { useState, useEffect } from 'react';
import { CheckCircle, Circle, Puzzle, Crown, Book, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface DailyChecklist {
  tactics: boolean;
  study: boolean;
  game: boolean;
  date: string;
}

export default function DailyGoalsMVP() {
  const [checklist, setChecklist] = useState<DailyChecklist>({
    tactics: false,
    study: false,
    game: false,
    date: new Date().toDateString(),
  });

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dailyChecklist');
      if (saved) {
        const parsed = JSON.parse(saved);
        const today = new Date().toDateString();

        // If it's a new day, reset the checklist
        if (parsed.date !== today) {
          const fresh = {
            tactics: false,
            study: false,
            game: false,
            date: today,
          };
          setChecklist(fresh);
          localStorage.setItem('dailyChecklist', JSON.stringify(fresh));
        } else {
          setChecklist(parsed);
        }
      }
    } catch (error) {
      console.warn('Failed to load daily checklist:', error);
    }
  }, []);

  // Save to localStorage when checklist changes
  useEffect(() => {
    try {
      localStorage.setItem('dailyChecklist', JSON.stringify(checklist));
    } catch (error) {
      console.warn('Failed to save daily checklist:', error);
    }
  }, [checklist]);

  const toggleItem = (item: keyof Omit<DailyChecklist, 'date'>) => {
    setChecklist((prev) => ({
      ...prev,
      [item]: !prev[item],
    }));
  };

  const completedCount = [checklist.tactics, checklist.study, checklist.game].filter(
    Boolean,
  ).length;
  const allComplete = completedCount === 3;

  return (
    <Card
      className={`${allComplete ? 'border-green-300 bg-green-50' : 'border-blue-300 bg-blue-50'} transition-colors duration-300`}
    >
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Target className={`h-5 w-5 ${allComplete ? 'text-green-600' : 'text-blue-600'}`} />
            <h3 className="font-semibold text-gray-800">
              {allComplete ? '🎉 Daily goals complete!' : "Today's Training Goals"}
            </h3>
          </div>
          <div className="text-sm text-gray-600">{completedCount}/3</div>
        </div>

        <div className="space-y-2">
          {/* Tactics */}
          <div
            className="flex cursor-pointer items-center space-x-3 rounded-lg p-2 transition-colors hover:bg-white/50"
            onClick={() => toggleItem('tactics')}
          >
            {checklist.tactics ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <Circle className="h-5 w-5 text-gray-400" />
            )}
            <Puzzle className="h-4 w-4 text-blue-600" />
            <span
              className={`flex-1 ${checklist.tactics ? 'text-green-700 line-through' : 'text-gray-700'}`}
            >
              Practice tactics
            </span>
          </div>

          {/* Game */}
          <div
            className="flex cursor-pointer items-center space-x-3 rounded-lg p-2 transition-colors hover:bg-white/50"
            onClick={() => toggleItem('game')}
          >
            {checklist.game ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <Circle className="h-5 w-5 text-gray-400" />
            )}
            <Crown className="h-4 w-4 text-emerald-600" />
            <span
              className={`flex-1 ${checklist.game ? 'text-green-700 line-through' : 'text-gray-700'}`}
            >
              Play a game
            </span>
          </div>

          {/* Study */}
          <div
            className="flex cursor-pointer items-center space-x-3 rounded-lg p-2 transition-colors hover:bg-white/50"
            onClick={() => toggleItem('study')}
          >
            {checklist.study ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <Circle className="h-5 w-5 text-gray-400" />
            )}
            <Book className="h-4 w-4 text-amber-600" />
            <span
              className={`flex-1 ${checklist.study ? 'text-green-700 line-through' : 'text-gray-700'}`}
            >
              Study chess
            </span>
          </div>
        </div>

        {allComplete && (
          <div className="mt-3 border-t border-green-200 pt-2">
            <p className="text-center text-sm font-medium text-green-700">
              Great job! You've hit all your training goals today! 🏆
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

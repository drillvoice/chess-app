import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { TrainingSession } from '@shared/schema';
import { MistakeStatsSection } from './mistake-stats-section';

function gameSession(id: number, daysAgo: number, mistakeTags: string[]): TrainingSession {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);

  return {
    id,
    type: 'game',
    date,
    gameResult: 'loss',
    mistakeTags: JSON.stringify(mistakeTags),
  } as TrainingSession;
}

function rowCount(tag: string): string {
  const label = screen.getByText(tag);
  return within(label.closest('li') as HTMLElement).getAllByText(/^\d+$/)[0].textContent ?? '';
}

describe('MistakeStatsSection', () => {
  const sessions = [
    gameSession(1, 1, ['hung a piece']),
    gameSession(2, 5, ['hung a piece', 'time trouble']),
    gameSession(3, 40, ['hung a piece']),
  ];

  it('lists all-time counts by default, most frequent first', () => {
    render(<MistakeStatsSection sessions={sessions} />);

    expect(rowCount('hung a piece')).toBe('3');
    expect(rowCount('time trouble')).toBe('1');
    expect(screen.getByText('Mistakes tagged in 3 of 3 games')).toBeTruthy();
  });

  it('narrows the counts when a time window is selected', () => {
    render(<MistakeStatsSection sessions={sessions} />);

    fireEvent.click(screen.getByRole('button', { name: 'Last 2 weeks' }));

    expect(rowCount('hung a piece')).toBe('2');
    expect(screen.getByText('Mistakes tagged in 2 of 2 games')).toBeTruthy();
  });

  it('explains an empty window', () => {
    render(<MistakeStatsSection sessions={[gameSession(1, 40, ['hung a piece'])]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));

    expect(screen.getByText('No games logged in this period')).toBeTruthy();
  });

  it('distinguishes untagged games from no games at all', () => {
    render(<MistakeStatsSection sessions={[gameSession(1, 0, [])]} />);

    expect(screen.getByText('No mistakes tagged in this period')).toBeTruthy();
  });
});

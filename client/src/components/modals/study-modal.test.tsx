import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainingSession } from '@shared/schema';
import '@testing-library/jest-dom/vitest';
import StudyModal from './study-modal';

const createSessionMock = vi.fn();
const updateSessionMock = vi.fn();
const useStudyPreferencesMock = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/firebase', () => ({
  createSession: (...args: unknown[]) => createSessionMock(...args),
  updateSession: (...args: unknown[]) => updateSessionMock(...args),
}));

vi.mock('@/hooks/use-study-preferences', () => ({
  useStudyPreferences: () => useStudyPreferencesMock(),
}));

vi.mock('@/components/ui/tag-manager', () => ({
  TagManager: ({
    onTagsChange,
  }: {
    selectedTags: string[];
    onTagsChange: (tags: string[]) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onTagsChange(['reading'])}>
        Select Reading
      </button>
      <button type="button" onClick={() => onTagsChange(['chessable'])}>
        Select Chessable
      </button>
    </div>
  ),
}));

function renderWithClient(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('StudyModal quantity inputs', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    createSessionMock.mockResolvedValue({});
    updateSessionMock.mockResolvedValue({});
    useStudyPreferencesMock.mockReturnValue({
      preferences: {
        customTags: ['reading', 'chessable'],
        tagConfigs: {},
      },
      isLoading: false,
      error: null,
    });
  });

  it('hides quantity controls when selected tags have no configured units', async () => {
    renderWithClient(<StudyModal open={true} onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /select reading/i }));

    await waitFor(() => {
      expect(screen.queryByLabelText(/primary tag for quantity/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/quantity/i)).not.toBeInTheDocument();
  });

  it('shows quantity controls when a configured tag is selected', async () => {
    useStudyPreferencesMock.mockReturnValue({
      preferences: {
        customTags: ['reading', 'chessable'],
        tagConfigs: {
          chessable: { unitLabel: 'variations' },
        },
      },
      isLoading: false,
      error: null,
    });

    renderWithClient(<StudyModal open={true} onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /select chessable/i }));

    expect(await screen.findByLabelText(/primary tag for quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/quantity \(units\)/i)).toBeInTheDocument();
  });

  it('requires a primary study tag when quantity is entered', async () => {
    useStudyPreferencesMock.mockReturnValue({
      preferences: {
        customTags: ['reading', 'chessable'],
        tagConfigs: {
          chessable: { unitLabel: 'variations' },
        },
      },
      isLoading: false,
      error: null,
    });

    renderWithClient(<StudyModal open={true} onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /select chessable/i }));
    fireEvent.change(screen.getByLabelText(/duration \(minutes\)/i), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText(/quantity \(units\)/i), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/primary study tag is required/i)).toBeInTheDocument();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('includes quantity and primaryStudyTag in save payload', async () => {
    useStudyPreferencesMock.mockReturnValue({
      preferences: {
        customTags: ['reading', 'chessable'],
        tagConfigs: {
          chessable: { unitLabel: 'variations' },
        },
      },
      isLoading: false,
      error: null,
    });

    renderWithClient(<StudyModal open={true} onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /select chessable/i }));
    fireEvent.change(screen.getByLabelText(/duration \(minutes\)/i), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText(/primary tag for quantity/i), {
      target: { value: 'chessable' },
    });
    fireEvent.change(screen.getByLabelText(/quantity \(variations\)|quantity \(units\)/i), {
      target: { value: '7' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(createSessionMock).toHaveBeenCalledTimes(1));
    const payload = createSessionMock.mock.calls[0][0];
    expect(payload.quantity).toBe(7);
    expect(payload.primaryStudyTag).toBe('chessable');
  });

  it('prefills edit mode and falls back to units label when config is missing', async () => {
    const editingSession = {
      id: 101,
      type: 'study',
      date: new Date('2026-02-10T12:00:00.000Z'),
      duration: 20,
      studyTags: JSON.stringify(['reading']),
      quantity: 3,
      primaryStudyTag: 'reading',
      studyNotes: 'chapter work',
    } as TrainingSession;

    renderWithClient(
      <StudyModal
        open={true}
        onOpenChange={() => {}}
        editingSession={editingSession}
        isEditMode={true}
      />,
    );

    expect(await screen.findByLabelText(/primary tag for quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/quantity \(units\)/i)).toHaveValue(3);
    expect(screen.getByLabelText(/primary tag for quantity/i)).toHaveValue('reading');
  });
});

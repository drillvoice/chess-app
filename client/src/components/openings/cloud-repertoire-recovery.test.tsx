import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CloudRepertoireRecovery } from './cloud-repertoire-recovery';
import * as repertoireStore from '@/lib/firebase/repertoires';

vi.mock('@/lib/firebase/repertoires', () => ({
  listCloudRepertoires: vi.fn(),
  restoreCloudRepertoire: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

const mockList = vi.mocked(repertoireStore.listCloudRepertoires);
const mockRestore = vi.mocked(repertoireStore.restoreCloudRepertoire);

function expand() {
  fireEvent.click(screen.getByRole('button', { name: /cloud backup/i }));
}

describe('CloudRepertoireRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says plainly when nothing was ever backed up', async () => {
    mockList.mockResolvedValue([]);
    render(<CloudRepertoireRecovery />);
    expand();

    await waitFor(() =>
      expect(screen.getByText(/no repertoires in the cloud/i)).toBeInTheDocument(),
    );
  });

  it('offers a restore for a repertoire deleted in the cloud', async () => {
    mockList.mockResolvedValue([
      {
        id: 'rep-1',
        name: 'Caro-Kann',
        side: 'black',
        moveCount: 412,
        updatedAt: '2026-05-01T00:00:00.000Z',
        deletedAt: '2026-05-02T00:00:00.000Z',
        presentLocally: false,
      },
    ]);
    mockRestore.mockResolvedValue({
      id: 'rep-1',
      name: 'Caro-Kann',
      side: 'black',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      rootNodeId: 'root',
      nodes: {},
      stats: {},
    });
    const onRestored = vi.fn();

    render(<CloudRepertoireRecovery onRestored={onRestored} />);
    expand();

    await waitFor(() => expect(screen.getByText('Caro-Kann')).toBeInTheDocument());
    expect(screen.getByText(/deleted in cloud/i)).toBeInTheDocument();
    expect(screen.getByText(/412 moves/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /restore/i }));
    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith('rep-1'));
    expect(onRestored).toHaveBeenCalledWith('rep-1');
  });

  it('shows the real error rather than an empty list when the read fails', async () => {
    mockList.mockRejectedValue(new Error('Missing or insufficient permissions.'));
    render(<CloudRepertoireRecovery />);
    expand();

    await waitFor(() =>
      expect(screen.getByText(/Missing or insufficient permissions/)).toBeInTheDocument(),
    );
  });

  it('prompts to sign in when there is no cloud to read', async () => {
    mockList.mockResolvedValue(null);
    render(<CloudRepertoireRecovery />);
    expand();

    await waitFor(() => expect(screen.getByText(/sign in to cloud sync/i)).toBeInTheDocument());
  });
});

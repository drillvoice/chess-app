import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
// Dynamic import for firebase to maintain code splitting
import { gameSessionSchema, type GameSession, type TrainingSession } from '@shared/schema';
import { Trophy, X, Square, Zap, Hourglass, Clock3 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface GameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSession?: TrainingSession;
  isEditMode?: boolean;
  onClearEditingSession?: () => void;
}

export default function GameModal({
  open,
  onOpenChange,
  editingSession,
  isEditMode = false,
  onClearEditingSession,
}: GameModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedResult, setSelectedResult] = useState<'win' | 'loss' | 'draw' | null>(null);
  const [selectedColor, setSelectedColor] = useState<'white' | 'black' | null>(null);
  const [selectedTimeControl, setSelectedTimeControl] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<'lichess' | 'chess.com' | 'otb' | null>(
    null,
  );
  const [opponentName, setOpponentName] = useState<string>('');
  const [isOpponentInputFocused, setIsOpponentInputFocused] = useState(false);
  const [selectedOpponentFromSuggestions, setSelectedOpponentFromSuggestions] = useState(false);
  const initialDate = editingSession?.date ? new Date(editingSession.date) : new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [dateInput, setDateInput] = useState<string>(format(initialDate, 'yyyy-MM-dd'));
  const isDateValid =
    /^\d{4}-\d{2}-\d{2}$/.test(dateInput) &&
    !Number.isNaN(selectedDate.getTime()) &&
    selectedDate <= new Date();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    trigger,
  } = useForm<GameSession>({
    resolver: zodResolver(gameSessionSchema),
    defaultValues: {
      type: 'game',
      gameResult:
        isEditMode && editingSession
          ? (editingSession.gameResult as 'win' | 'loss' | 'draw' | undefined)
          : undefined,
      gameComments: isEditMode && editingSession ? editingSession.gameComments || '' : '',
      playerColor:
        isEditMode && editingSession
          ? (editingSession.playerColor as 'white' | 'black' | undefined)
          : undefined,
      platform:
        isEditMode && editingSession
          ? (editingSession.platform as 'lichess' | 'chess.com' | 'otb' | undefined)
          : undefined,
      timeControl:
        isEditMode && editingSession
          ? (editingSession.timeControl as 'bullet' | 'blitz' | 'rapid' | 'classical' | undefined)
          : undefined,
      opponentUsername: isEditMode && editingSession ? editingSession.opponentUsername || '' : '',
    },
  });

  const opponentUsernameField = register('opponentUsername');

  // Fetch all sessions to extract opponent names for autocomplete
  const { data: allSessions } = useQuery<TrainingSession[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { getAllSessions } = await import('@/lib/firebase');
      return await getAllSessions();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Memoize the list of unique opponent names from OTB games only
  const opponentNames = useMemo(() => {
    if (!allSessions) return [];

    const names = allSessions
      .filter(
        (session) =>
          session.type === 'game' && session.platform === 'otb' && session.opponentUsername,
      )
      .map((session) => session.opponentUsername as string);

    // Return unique names sorted alphabetically
    return Array.from(new Set(names)).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
  }, [allSessions]);

  const filteredOpponentNames = useMemo(() => {
    const query = opponentName.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return opponentNames.filter((name) => name.toLowerCase().includes(query));
  }, [opponentName, opponentNames]);

  const mutation = useMutation({
    mutationFn: async (data: GameSession) => {
      const { createSession, updateSession } = await import('@/lib/firebase');
      if (isEditMode && editingSession) {
        // Preserve existing fields that shouldn't be overwritten
        const updateData = {
          ...data,
          needsReview: false,
          duration: editingSession.duration,
          // Only update platform/timeControl if they were actually changed
          platform: data.platform ?? editingSession.platform,
          timeControl: data.timeControl ?? editingSession.timeControl,
          // Update opponentUsername from form data
          opponentUsername: data.opponentUsername || editingSession.opponentUsername,
        };
        return await updateSession(editingSession.id, updateData);
      }
      return await createSession(data);
    },
    onMutate: async (newSession) => {
      // Close modal immediately for better UX
      onOpenChange(false);
      reset();
      setSelectedResult(null);
      setSelectedColor(null);
      setSelectedTimeControl(null);
      setSelectedPlatform(null);
      setOpponentName('');
      setSelectedOpponentFromSuggestions(false);
      setIsOpponentInputFocused(false);
      const now = new Date();
      setSelectedDate(now);
      setDateInput(format(now, 'yyyy-MM-dd'));

      // Show immediate feedback
      toast({
        title: isEditMode ? 'Updating...' : 'Saving...',
        description: `Game session is being ${isEditMode ? 'updated' : 'saved'}`,
      });

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['sessions'] });
      await queryClient.cancelQueries({ queryKey: ['statistics'] });

      // Snapshot previous values
      const previousSessions = queryClient.getQueryData<TrainingSession[]>(['sessions']);
      const previousStats = queryClient.getQueryData(['statistics']);

      // Prepare optimistic session
      if (isEditMode && editingSession) {
        const optimisticSession: TrainingSession = {
          id: editingSession.id,
          type: 'game',
          date: newSession.date || editingSession.date,
          duration: editingSession.duration, // Preserve existing duration
          pointsGained: null,
          finalScore: null,
          puzzlesAttempted: null,
          puzzlesCorrect: null,
          tacticsNotes: null,
          gameResult: newSession.gameResult,
          gameType: null,
          gameComments: newSession.gameComments || null,
          playerColor: newSession.playerColor,
          platform: newSession.platform ?? editingSession.platform, // Preserve existing platform if not changed
          timeControl: newSession.timeControl ?? editingSession.timeControl, // Preserve existing timeControl if not changed
          opponentUsername: newSession.opponentUsername || editingSession.opponentUsername || null,
          studyType: null,
          studyTags: null,
          studyNotes: null,
          quantity: null,
          primaryStudyTag: null,
          goalTitle: null,
          goalDescription: null,
          goalWeekStart: null,
          needsReview: false,
        };

        queryClient.setQueryData<TrainingSession[]>(['sessions'], (old = []) =>
          old.map((session) => (session.id === editingSession.id ? optimisticSession : session)),
        );

        return { previousSessions, previousStats };
      } else {
        const tempId = -Date.now(); // Use negative ID to distinguish from real sessions
        const optimisticSession: TrainingSession = {
          id: tempId,
          type: 'game',
          date: newSession.date,
          duration: null,
          pointsGained: null,
          finalScore: null,
          puzzlesAttempted: null,
          puzzlesCorrect: null,
          tacticsNotes: null,
          gameResult: newSession.gameResult,
          gameType: null,
          gameComments: newSession.gameComments || null,
          playerColor: newSession.playerColor,
          platform: newSession.platform ?? null,
          timeControl: newSession.timeControl ?? null,
          opponentUsername: newSession.opponentUsername || null,
          studyType: null,
          studyTags: null,
          studyNotes: null,
          quantity: null,
          primaryStudyTag: null,
          goalTitle: null,
          goalDescription: null,
          goalWeekStart: null,
          needsReview: false,
          // Add a flag to identify this as a pending session
          _pending: true,
        } as any;

        queryClient.setQueryData<TrainingSession[]>(['sessions'], (old = []) => [
          optimisticSession,
          ...old,
        ]);

        return { previousSessions, previousStats, tempId };
      }
    },
    onSuccess: (result, variables, context) => {
      // Remove temporary session if it exists
      if (context?.tempId) {
        queryClient.setQueryData<TrainingSession[]>(['sessions'], (old = []) =>
          old.filter((session) => session.id !== context.tempId),
        );
      }

      // Show success notification
      toast({
        title: 'Success',
        description: isEditMode
          ? 'Game session updated successfully!'
          : 'Game session logged successfully!',
      });

      // Refresh data to show the real session
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-goal'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-activity'] });
      queryClient.invalidateQueries({ queryKey: ['pending-review'] });
      onClearEditingSession?.();
    },
    onError: (error: any, _newSession, context) => {
      // Remove temporary session if it exists
      if (context?.tempId) {
        queryClient.setQueryData<TrainingSession[]>(['sessions'], (old = []) =>
          old.filter((session) => session.id !== context.tempId),
        );
      }

      // Check if it's a timeout error but session might have been saved
      if (error.message?.includes('timeout')) {
        toast({
          title: 'Slow Connection',
          description: 'Session may have been saved. Please check your activity to confirm.',
          variant: 'destructive',
        });
        // Refresh data to check if the session was actually saved
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      } else {
        if (context?.previousSessions) {
          queryClient.setQueryData(['sessions'], context.previousSessions);
        }
        if (context?.previousStats) {
          queryClient.setQueryData(['statistics'], context.previousStats);
        }
        toast({
          title: 'Error',
          description: error.message || 'Failed to log game session',
          variant: 'destructive',
        });
      }
      onClearEditingSession?.();
    },
  });

  useEffect(() => {
    if (isEditMode && editingSession) {
      const gameResult = editingSession.gameResult as 'win' | 'loss' | 'draw' | null;
      const playerColor = editingSession.playerColor as 'white' | 'black' | null;
      const timeControl = editingSession.timeControl;
      const platform = editingSession.platform;
      const opponentUsername = editingSession.opponentUsername || '';

      // Set visual state
      setSelectedResult(gameResult);
      setSelectedColor(playerColor);
      setSelectedTimeControl(timeControl);
      setSelectedPlatform(platform as 'lichess' | 'chess.com' | 'otb' | null);
      setOpponentName(opponentUsername);
      setSelectedOpponentFromSuggestions(false);
      setIsOpponentInputFocused(false);
      const editDate = new Date(editingSession.date);
      setSelectedDate(editDate);
      setDateInput(format(editDate, 'yyyy-MM-dd'));

      // Set form values properly with validation
      if (gameResult) {
        setValue('gameResult', gameResult, { shouldValidate: true });
      }
      if (playerColor) {
        setValue('playerColor', playerColor, { shouldValidate: true });
      }
      if (timeControl) {
        setValue('timeControl', timeControl as any, { shouldValidate: true });
      }
      if (platform) {
        setValue('platform', platform as any, { shouldValidate: true });
      }
      // Load existing comments for any game being edited
      if (editingSession.gameComments) {
        setValue('gameComments', editingSession.gameComments, { shouldValidate: true });
      }
      // Load existing opponent name
      if (opponentUsername) {
        setValue('opponentUsername', opponentUsername, { shouldValidate: true });
      }
    } else {
      const now = new Date();
      setSelectedDate(now);
      setDateInput(format(now, 'yyyy-MM-dd'));
    }
  }, [editingSession, isEditMode, setValue]);

  const onSubmit = (data: GameSession) => {
    if (selectedDate > new Date()) {
      toast({
        title: 'Invalid date',
        description: 'Date cannot be in the future',
        variant: 'destructive',
      });
      return;
    }

    // Add selected date to the session data
    const sessionData = {
      ...data,
      date: selectedDate,
    };
    mutation.mutate(sessionData);
  };

  const handleResultSelect = (result: 'win' | 'loss' | 'draw') => {
    setSelectedResult(result);
    setValue('gameResult', result, { shouldValidate: true });
    trigger('gameResult');
  };

  const handleColorSelect = (color: 'white' | 'black') => {
    setSelectedColor(color);
    setValue('playerColor', color, { shouldValidate: true });
    trigger('playerColor');
  };

  const handleTimeControlSelect = (timeControl: string) => {
    if (selectedTimeControl === timeControl) {
      // Deselect if clicking the same time control
      setSelectedTimeControl(null);
      setValue('timeControl', undefined, { shouldValidate: true });
    } else {
      setSelectedTimeControl(timeControl);
      setValue('timeControl', timeControl as any, { shouldValidate: true });
    }
    trigger('timeControl');
  };

  const shouldShowOpponentSuggestions =
    selectedPlatform === 'otb' && isOpponentInputFocused && filteredOpponentNames.length > 0;

  const handleOpponentSuggestionSelect = (name: string) => {
    setOpponentName(name);
    setSelectedOpponentFromSuggestions(true);
    setValue('opponentUsername', name, { shouldValidate: true });
    setIsOpponentInputFocused(false);
  };

  const handlePlatformSelect = (platform: 'lichess' | 'chess.com' | 'otb') => {
    if (selectedPlatform === platform) {
      // Deselect if clicking the same platform
      setSelectedPlatform(null);
      setValue('platform', undefined, { shouldValidate: true });
      // Clear opponent name when deselecting OTB
      if (platform === 'otb') {
        setOpponentName('');
        setSelectedOpponentFromSuggestions(false);
        setIsOpponentInputFocused(false);
        setValue('opponentUsername', '', { shouldValidate: true });
      }
    } else {
      setSelectedPlatform(platform);
      setValue('platform', platform, { shouldValidate: true });
      // Clear opponent name when switching away from OTB
      if (selectedPlatform === 'otb' && platform !== 'otb') {
        setOpponentName('');
        setSelectedOpponentFromSuggestions(false);
        setIsOpponentInputFocused(false);
        setValue('opponentUsername', '', { shouldValidate: true });
      }
    }
    trigger('platform');
  };

  const handleModalChange = (open: boolean) => {
    if (!open) {
      // Only reset if not in edit mode or if we're closing after editing
      if (!isEditMode) {
        reset({
          type: 'game',
          gameResult: undefined,
          gameComments: '',
          playerColor: undefined,
          platform: undefined,
          timeControl: undefined,
          opponentUsername: '',
        });
        setSelectedResult(null);
        setSelectedColor(null);
        setSelectedTimeControl(null);
        setSelectedPlatform(null);
        setOpponentName('');
        setSelectedOpponentFromSuggestions(false);
        setIsOpponentInputFocused(false);
      }
      if (!mutation.isPending) {
        onClearEditingSession?.();
      }
      const resetDate = editingSession?.date ? new Date(editingSession.date) : new Date();
      setSelectedDate(resetDate);
      setDateInput(format(resetDate, 'yyyy-MM-dd'));
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleModalChange}>
      <DialogContent className="mobile-modal sm:max-w-md">
        <DialogHeader className="relative flex items-center justify-center pb-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="absolute left-0 top-1/2 h-auto -translate-y-1/2 px-2 py-1 text-sm font-normal"
                type="button"
              >
                {format(selectedDate, 'EEE d MMM')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2">
              <input
                aria-label="Select date"
                type="date"
                className="rounded border p-1 text-sm"
                max={format(new Date(), 'yyyy-MM-dd')}
                value={dateInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setDateInput(value);
                  const [year, month, day] = value.split('-').map(Number);
                  if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
                    const parsed = new Date(year, month - 1, day);
                    if (!Number.isNaN(parsed.getTime())) {
                      setSelectedDate(parsed);
                    }
                  }
                }}
              />
            </PopoverContent>
          </Popover>
          <DialogTitle className="text-xl font-bold text-gray-800">Log game</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto p-2">
            <div>
              <Label className="mb-2 block text-sm font-medium text-gray-700">Colour</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-auto items-center justify-center space-x-2 px-3 py-2',
                    selectedColor === 'white'
                      ? 'border-gray-600 bg-gray-100 text-gray-800 ring-2 ring-gray-600'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                  )}
                  onClick={() => handleColorSelect('white')}
                >
                  <Square className="h-4 w-4 fill-white stroke-gray-800" />
                  <span>White</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-auto items-center justify-center space-x-2 px-3 py-2',
                    selectedColor === 'black'
                      ? 'border-gray-600 bg-gray-200 text-gray-800 ring-2 ring-gray-600'
                      : 'border-gray-300 bg-gray-800 text-white hover:bg-gray-700',
                  )}
                  onClick={() => handleColorSelect('black')}
                >
                  <Square className="h-4 w-4 fill-gray-800" />
                  <span>Black</span>
                </Button>
              </div>
              {errors.playerColor && (
                <p className="mt-1 text-sm text-red-600">{errors.playerColor.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium text-gray-700">Result</Label>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-auto items-center justify-center space-x-2 px-3 py-2',
                    selectedResult === 'win'
                      ? 'border-green-600 bg-green-100 text-green-800 ring-2 ring-green-600'
                      : 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100',
                  )}
                  onClick={() => handleResultSelect('win')}
                >
                  <Trophy className="h-4 w-4" />
                  <span>Win</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-auto items-center justify-center space-x-2 px-3 py-2',
                    selectedResult === 'draw'
                      ? 'border-gray-600 bg-gray-100 text-gray-800 ring-2 ring-gray-600'
                      : 'border-gray-300 bg-gray-50 text-gray-800 hover:bg-gray-100',
                  )}
                  onClick={() => handleResultSelect('draw')}
                >
                  <Square className="h-4 w-4" />
                  <span>Draw</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-auto items-center justify-center space-x-2 px-3 py-2',
                    selectedResult === 'loss'
                      ? 'border-red-600 bg-red-100 text-red-800 ring-2 ring-red-600'
                      : 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100',
                  )}
                  onClick={() => handleResultSelect('loss')}
                >
                  <X className="h-4 w-4" />
                  <span>Loss</span>
                </Button>
              </div>
              {errors.gameResult && (
                <p className="mt-1 text-sm text-red-600">{errors.gameResult.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium text-gray-700">Time control</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { value: 'bullet', label: 'Bullet', icon: '•' },
                  { value: 'blitz', label: 'Blitz', icon: Zap },
                  { value: 'rapid', label: 'Rapid', icon: Hourglass },
                  { value: 'classical', label: 'Classical', icon: Clock3 },
                ].map((tc) => (
                  <Button
                    key={tc.value}
                    type="button"
                    variant="outline"
                    className={cn(
                      'flex h-auto min-h-[44px] min-w-0 items-center justify-center gap-1 whitespace-normal px-2 py-2 text-center leading-tight',
                      selectedTimeControl === tc.value
                        ? 'border-blue-600 bg-blue-100 text-blue-800 ring-2 ring-blue-600'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                    )}
                    onClick={() => handleTimeControlSelect(tc.value)}
                  >
                    {typeof tc.icon === 'string' ? (
                      <span className="text-sm font-bold">{tc.icon}</span>
                    ) : (
                      <tc.icon className="h-3 w-3" />
                    )}
                    <span className="text-sm">{tc.label}</span>
                  </Button>
                ))}
              </div>
              {errors.timeControl && (
                <p className="mt-1 text-sm text-red-600">{errors.timeControl.message}</p>
              )}
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium text-gray-700">Platform</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-auto min-h-[44px] min-w-0 items-center justify-center gap-2 whitespace-normal px-2 py-2 text-center leading-tight',
                    selectedPlatform === 'lichess'
                      ? 'border-blue-600 bg-blue-100 text-blue-800 ring-2 ring-blue-600'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                  )}
                  onClick={() => handlePlatformSelect('lichess')}
                >
                  <span>Lichess</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'flex h-auto min-h-[44px] min-w-0 items-center justify-center gap-2 whitespace-normal px-2 py-2 text-center leading-tight',
                    selectedPlatform === 'chess.com'
                      ? 'border-blue-600 bg-blue-100 text-blue-800 ring-2 ring-blue-600'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                  )}
                  onClick={() => handlePlatformSelect('chess.com')}
                >
                  <span>Chess.com</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'col-span-2 flex h-auto min-h-[44px] min-w-0 items-center justify-center gap-2 whitespace-normal px-2 py-2 text-center leading-tight sm:col-span-1',
                    selectedPlatform === 'otb'
                      ? 'border-blue-600 bg-blue-100 text-blue-800 ring-2 ring-blue-600'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                  )}
                  onClick={() => handlePlatformSelect('otb')}
                >
                  <span>Over the Board</span>
                </Button>
              </div>
              {errors.platform && (
                <p className="mt-1 text-sm text-red-600">{errors.platform.message}</p>
              )}
            </div>

            {/* Opponent name field - only shown for OTB games */}
            {selectedPlatform === 'otb' && (
              <div>
                <Label htmlFor="opponentName" className="text-sm font-medium text-gray-700">
                  Opponent name (optional)
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="opponentName"
                    type="text"
                    autoComplete="off"
                    placeholder="Enter opponent name..."
                    className={cn(
                      selectedOpponentFromSuggestions
                        ? 'border-emerald-500 ring-2 ring-emerald-200'
                        : '',
                    )}
                    value={opponentName}
                    aria-autocomplete="list"
                    aria-controls={
                      shouldShowOpponentSuggestions ? 'opponent-name-suggestions' : undefined
                    }
                    aria-expanded={shouldShowOpponentSuggestions}
                    {...opponentUsernameField}
                    onFocus={() => {
                      setIsOpponentInputFocused(true);
                    }}
                    onBlur={(event) => {
                      opponentUsernameField.onBlur(event);
                      window.setTimeout(() => {
                        setIsOpponentInputFocused(false);
                        const trimmedName = opponentName.trim();
                        if (
                          trimmedName &&
                          opponentNames.some(
                            (name) => name.toLowerCase() === trimmedName.toLowerCase(),
                          )
                        ) {
                          setSelectedOpponentFromSuggestions(true);
                        }
                      }, 100);
                    }}
                    onChange={(e) => {
                      opponentUsernameField.onChange(e);
                      setOpponentName(e.target.value);
                      setSelectedOpponentFromSuggestions(false);
                      setValue('opponentUsername', e.target.value, { shouldValidate: true });
                    }}
                  />
                  {shouldShowOpponentSuggestions && (
                    <ul
                      id="opponent-name-suggestions"
                      role="listbox"
                      aria-label="Opponent suggestions"
                      className="absolute left-0 right-0 top-full z-50 mt-2 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
                    >
                      {filteredOpponentNames.map((name) => (
                        <li key={name} role="option" aria-selected="false">
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center justify-start px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleOpponentSuggestionSelect(name);
                            }}
                          >
                            {name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {selectedOpponentFromSuggestions && opponentName.trim() && (
                  <div
                    className="mt-2 inline-flex items-center rounded-full border border-emerald-500 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700"
                    data-testid="opponent-name-chip"
                  >
                    {opponentName.trim()}
                  </div>
                )}
                {errors.opponentUsername && (
                  <p className="mt-1 text-sm text-red-600">{errors.opponentUsername.message}</p>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="gameComments" className="text-sm font-medium text-gray-700">
                Comments
              </Label>
              <Textarea
                id="gameComments"
                placeholder="Great endgame technique..."
                className="mt-1"
                rows={2}
                {...register('gameComments')}
              />
            </div>
          </div>

          <div className="flex space-x-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="modal-button flex-1"
              onClick={() => handleModalChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="modal-button flex-1 bg-[#059669] hover:bg-emerald-700"
              disabled={mutation.isPending || !isDateValid}
            >
              {mutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

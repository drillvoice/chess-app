import type { TrainingSession } from '@shared/schema';

export type SessionEventMap = {
  sessionAdded: TrainingSession;
  sessionUpdated: TrainingSession;
  sessionDeleted: { id: number };
  sessionsReplaced: TrainingSession[];
};

type SessionEventName = keyof SessionEventMap;
type SessionEventListener<K extends SessionEventName> = (
  payload: SessionEventMap[K],
) => void;

type AnySessionListener = SessionEventListener<SessionEventName>;

class SessionEventEmitter {
  private listeners = new Map<SessionEventName, Set<AnySessionListener>>();

  on<K extends SessionEventName>(event: K, listener: SessionEventListener<K>): () => void {
    const eventListeners = this.listeners.get(event) ?? new Set<AnySessionListener>();
    eventListeners.add(listener as AnySessionListener);
    this.listeners.set(event, eventListeners);

    return () => {
      this.off(event, listener);
    };
  }

  off<K extends SessionEventName>(event: K, listener: SessionEventListener<K>): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;

    eventListeners.delete(listener as AnySessionListener);

    if (eventListeners.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<K extends SessionEventName>(event: K, payload: SessionEventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;

    // Clone the set to prevent issues if listeners unregister during iteration
    const listeners = Array.from(eventListeners);
    for (const listener of listeners) {
      try {
        (listener as SessionEventListener<K>)(payload);
      } catch (error) {
        console.warn(`Session event listener for "${event}" threw an error`, error);
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

export const sessionEvents = new SessionEventEmitter();

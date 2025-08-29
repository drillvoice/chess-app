// SQLite storage implementation for React Native
/* eslint-disable import/no-unresolved */
import SQLite from 'react-native-sqlite-storage';

interface TrainingSession {
  id: number;
  type: string;
  date: Date;
  duration?: number;
  pointsGained?: number;
  finalScore?: number;
  tacticsNotes?: string;
  gameResult?: string;
  gameType?: string;
  gameComments?: string;
  playerColor?: string;
  platform?: string;
  timeControl?: string;
  opponentUsername?: string;
  needsReview: boolean;
  studyType?: string;
  studyNotes?: string;
  goalTitle?: string;
  goalDescription?: string;
  goalWeekStart?: Date;
}

class SQLiteStorage {
  private db: SQLite.SQLiteDatabase | null = null;

  async init(): Promise<void> {
    try {
      this.db = await SQLite.openDatabase({
        name: 'ChessLog.db',
        location: 'default',
        createFromLocation: 1,
      });

      await this.createTables();
      console.log('SQLite database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SQLite database:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const createSessionsTable = `
      CREATE TABLE IF NOT EXISTS training_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        date DATETIME NOT NULL,
        duration INTEGER,
        points_gained INTEGER,
        final_score INTEGER,
        tactics_notes TEXT,
        game_result TEXT,
        game_type TEXT,
        game_comments TEXT,
        player_color TEXT,
        platform TEXT,
        time_control TEXT,
        opponent_username TEXT,
        needs_review BOOLEAN DEFAULT FALSE,
        study_type TEXT,
        study_notes TEXT,
        goal_title TEXT,
        goal_description TEXT,
        goal_week_start DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createSettingsTable = `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createStatisticsTable = `
      CREATE TABLE IF NOT EXISTS statistics_cache (
        id INTEGER PRIMARY KEY,
        data TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this.db.executeSql(createSessionsTable);
    await this.db.executeSql(createSettingsTable);
    await this.db.executeSql(createStatisticsTable);
  }

  async getSessions(): Promise<TrainingSession[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const [results] = await this.db.executeSql(
        'SELECT * FROM training_sessions ORDER BY date DESC',
      );

      const sessions: TrainingSession[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        const row = results.rows.item(i);
        sessions.push({
          id: row.id,
          type: row.type,
          date: new Date(row.date),
          duration: row.duration,
          pointsGained: row.points_gained,
          finalScore: row.final_score,
          tacticsNotes: row.tactics_notes,
          gameResult: row.game_result,
          gameType: row.game_type,
          gameComments: row.game_comments,
          playerColor: row.player_color,
          platform: row.platform,
          timeControl: row.time_control,
          opponentUsername: row.opponent_username,
          needsReview: row.needs_review === 1,
          studyType: row.study_type,
          studyNotes: row.study_notes,
          goalTitle: row.goal_title,
          goalDescription: row.goal_description,
          goalWeekStart: row.goal_week_start ? new Date(row.goal_week_start) : undefined,
        });
      }

      return sessions;
    } catch (error) {
      console.error('Failed to get sessions from SQLite:', error);
      return [];
    }
  }

  async addSession(session: Omit<TrainingSession, 'id'>): Promise<TrainingSession> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const [result] = await this.db.executeSql(
        `INSERT INTO training_sessions (
          type, date, duration, points_gained, final_score, tactics_notes,
          game_result, game_type, game_comments, player_color, platform,
          time_control, needs_review, study_type, study_notes, goal_title,
          goal_description, goal_week_start
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.type,
          session.date.toISOString(),
          session.duration,
          session.pointsGained,
          session.finalScore,
          session.tacticsNotes,
          session.gameResult,
          session.gameType,
          session.gameComments,
          session.playerColor,
          session.platform,
          session.timeControl,
          session.needsReview ? 1 : 0,
          session.studyType,
          session.studyNotes,
          session.goalTitle,
          session.goalDescription,
          session.goalWeekStart?.toISOString(),
        ],
      );

      return {
        ...session,
        id: result.insertId,
      };
    } catch (error) {
      console.error('Failed to add session to SQLite:', error);
      throw error;
    }
  }

  async updateSession(id: number, updates: Partial<TrainingSession>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const setClause = Object.keys(updates)
        .filter((key) => key !== 'id')
        .map((key) => `${this.camelToSnake(key)} = ?`)
        .join(', ');

      const values = Object.entries(updates)
        .filter(([key]) => key !== 'id')
        .map(([, value]) => {
          if (value instanceof Date) return value.toISOString();
          if (typeof value === 'boolean') return value ? 1 : 0;
          return value;
        });

      await this.db.executeSql(
        `UPDATE training_sessions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, id],
      );
    } catch (error) {
      console.error('Failed to update session in SQLite:', error);
      throw error;
    }
  }

  async deleteSession(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.executeSql('DELETE FROM training_sessions WHERE id = ?', [id]);
    } catch (error) {
      console.error('Failed to delete session from SQLite:', error);
      throw error;
    }
  }

  async getSetting(key: string): Promise<string | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const [results] = await this.db.executeSql('SELECT value FROM settings WHERE key = ?', [key]);

      if (results.rows.length > 0) {
        return results.rows.item(0).value;
      }
      return null;
    } catch (error) {
      console.error('Failed to get setting from SQLite:', error);
      return null;
    }
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.executeSql(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [key, value],
      );
    } catch (error) {
      console.error('Failed to set setting in SQLite:', error);
      throw error;
    }
  }

  async getStatistics(): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const [results] = await this.db.executeSql('SELECT data FROM statistics_cache WHERE id = 1');

      if (results.rows.length > 0) {
        return JSON.parse(results.rows.item(0).data);
      }
      return null;
    } catch (error) {
      console.error('Failed to get statistics from SQLite:', error);
      return null;
    }
  }

  async setStatistics(stats: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.executeSql(
        'INSERT OR REPLACE INTO statistics_cache (id, data, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)',
        [JSON.stringify(stats)],
      );
    } catch (error) {
      console.error('Failed to set statistics in SQLite:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.executeSql('DELETE FROM training_sessions');
      await this.db.executeSql('DELETE FROM settings');
      await this.db.executeSql('DELETE FROM statistics_cache');
    } catch (error) {
      console.error('Failed to clear SQLite database:', error);
      throw error;
    }
  }

  async getStorageSize(): Promise<{ size: number; sessionCount: number }> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const [sessionResults] = await this.db.executeSql(
        'SELECT COUNT(*) as count FROM training_sessions',
      );

      // Note: Getting actual database file size would require native module
      // This is a simplified estimate
      const sessionCount = sessionResults.rows.item(0).count;
      const estimatedSize = sessionCount * 1024; // Rough estimate

      return {
        size: estimatedSize,
        sessionCount,
      };
    } catch (error) {
      console.error('Failed to get storage size from SQLite:', error);
      return { size: 0, sessionCount: 0 };
    }
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}

export default SQLiteStorage;

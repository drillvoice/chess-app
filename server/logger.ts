import { type Request, type Response, type NextFunction } from 'express';

// Simple logger with level support and environment awareness
// Defaults to verbose logging in development and warnings+errors in production

type LogLevel = 'info' | 'warn' | 'error';

const envLevel: LogLevel = process.env.NODE_ENV === 'production' ? 'warn' : 'info';
const levelWeights: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 };

function shouldLog(level: LogLevel) {
  return levelWeights[level] >= levelWeights[envLevel];
}

function format(level: LogLevel, message: string, source: string) {
  if (process.env.NODE_ENV === 'production') {
    return `[${source}] ${message}`;
  }

  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  return `${formattedTime} [${source}] ${level.toUpperCase()} ${message}`;
}

export const logger = {
  info(message: string, source = 'express') {
    if (shouldLog('info')) {
      console.log(format('info', message, source));
    }
  },
  warn(message: string, source = 'express') {
    if (shouldLog('warn')) {
      console.warn(format('warn', message, source));
    }
  },
  error(message: string, source = 'express') {
    if (shouldLog('error')) {
      console.error(format('error', message, source));
    }
  },
};

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      let line = `${req.method} ${req.path} ${res.statusCode} in ${duration}ms`;
      const contentType = res.get('Content-Type');
      const contentLength = res.get('Content-Length');
      if (contentLength && contentType && contentType.includes('application/json')) {
        line += ` ${contentLength}b`;
      }
      if (line.length > 80) {
        line = line.slice(0, 79) + '…';
      }
      logger.info(line);
    }
  });

  next();
}

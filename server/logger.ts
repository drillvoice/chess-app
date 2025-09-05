import { type Request, type Response, type NextFunction } from 'express';
import { log } from './vite';

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
      log(line);
    }
  });

  next();
}

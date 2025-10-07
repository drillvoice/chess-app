// Vercel serverless function entry point
import express, { type Request, Response, NextFunction } from 'express';
import { registerRoutes } from '../server/routes';
import { serveStatic } from '../server/vite';
import { fromZodError } from 'zod-validation-error';
import { requestLogger } from '../server/logger';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(requestLogger);

// Register routes
registerRoutes(app).then(() => {
  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    let status = err.status || err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    if (err.name === 'ZodError') {
      const validationError = fromZodError(err);
      status = 400;
      message = validationError.message;
    }

    res.status(status).json({ message });
  });

  // Serve static files in production
  serveStatic(app);
});

export default app;

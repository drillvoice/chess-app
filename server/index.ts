import express, { type Request, Response, NextFunction, json, urlencoded } from 'express';
import { registerRoutes } from './routes';
import { setupVite, serveStatic } from './vite';
import { fromZodError } from 'zod-validation-error';
import { requestLogger, logger } from './logger';

const app = express();
app.use(json());
app.use(urlencoded({ extended: false }));

app.use(requestLogger);

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    let status = err.status || err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    if (err.name === 'ZodError') {
      const validationError = fromZodError(err);
      status = 400;
      message = validationError.message;
    }

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get('env') === 'development') {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve the app on the port defined by the PORT environment variable.
  // Defaults to 5000 to match the public firewall configuration.
  const port = Number(process.env.PORT) || 5000;
  server.listen(
    {
      port,
      host: '0.0.0.0',
      reusePort: true,
    },
    () => {
      logger.info(`serving on port ${port}`, 'server');
    },
  );
})();

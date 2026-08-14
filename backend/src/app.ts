import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { resolveTenant } from './middleware/tenant';
import authRoutes from './routes/auth';
import billingRoutes from './routes/billing';
import webhookRoutes from './routes/webhooks';
import appRoutes from './routes/app';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(morgan('dev'));

app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json({ limit: '5mb' }));
app.use(resolveTenant);

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'business-advisor-backend',
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/app', appRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
});

export default app;

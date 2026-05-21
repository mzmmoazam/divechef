import * as Sentry from '@sentry/nextjs';
import { scrubSensitiveData } from '@divechef/shared';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',
  beforeSend: scrubSensitiveData,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

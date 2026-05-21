import * as Sentry from '@sentry/react-native';
import { scrubSensitiveData } from '@divechef/shared';

/**
 * Sentry initialization for the mobile app.
 *
 * Imported as a side-effect at the top of App.tsx so it runs before
 * any other code that might throw. Same DSN as web (one Sentry project,
 * two consumers); environment tag distinguishes mobile from web events.
 */
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',
  tracesSampleRate: 0.1,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeSend: scrubSensitiveData as any,
  // Print Sentry's own breadcrumbs to the JS console only in dev builds.
  debug: __DEV__,
});

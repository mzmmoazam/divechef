import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveData } from "@divechef/shared";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.SENTRY_ENVIRONMENT ?? "development",
  beforeSend: scrubSensitiveData,
});

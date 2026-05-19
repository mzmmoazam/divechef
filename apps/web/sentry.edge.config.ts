import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveData } from "./src/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.SENTRY_ENVIRONMENT ?? "development",
  beforeSend: scrubSensitiveData,
});

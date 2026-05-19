import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveData } from "./src/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  beforeSend: scrubSensitiveData,
});

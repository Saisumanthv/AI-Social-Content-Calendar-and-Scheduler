# Publish Runner

Small Node runner to publish scheduled LinkedIn posts from your Supabase database. Designed to run periodically (cron/GitHub Actions/hosted runner).

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TOKEN_ENCRYPTION_KEY` (base64, same key used by your Supabase functions)
- `LINKEDIN_CLIENT_ID` (for token refresh)
- `LINKEDIN_CLIENT_SECRET` (for token refresh)
- `OAUTH_REDIRECT_URI`
- `REDIS_URL` (optional, default: `redis://127.0.0.1:6379`)
- `RATE_LIMIT_MAX` (optional, default: `5` - maximum number of jobs processed within rate limit duration)
- `RATE_LIMIT_DURATION_MS` (optional, default: `60000` - duration window in milliseconds for rate limits)
- `RETRY_ATTEMPTS` (optional, default: `3` - number of attempts for failing jobs)
- `RETRY_BACKOFF_DELAY_MS` (optional, default: `5000` - base delay in milliseconds for exponential backoff retries)

Run locally:

```bash
cd runners/publish-runner
npm ci
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TOKEN_ENCRYPTION_KEY=... node index.js
```

Docker:

```bash
docker build -t publish-runner:latest .
docker run -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... -e TOKEN_ENCRYPTION_KEY=... publish-runner:latest
```

GitHub Actions: you can use the included workflow to run every 5 minutes. Configure the necessary repository secrets.

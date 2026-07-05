# PrimeHealth - Supabase Cron Setup

## process-knowlarity-webhook-queue
Fires every minute. Calls process-webhooks endpoint.

### Setup SQL:
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'process-knowlarity-webhook-queue',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://the-skin-centre.vercel.app/api/cron/process-webhooks',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET from Vercel env>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
```

### Verify it's running:
```sql
select j.jobname, d.status, d.return_message, d.start_time
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
order by d.start_time desc limit 10;
```

### Verify HTTP responses:
```sql
select created, status_code, content
from net._http_response
order by created desc limit 10;
```

### If it stops working:
1. Check `status_code` - `401` means `CRON_SECRET` mismatch
2. Check `status_code` - `500` means Vercel function error, check logs
3. Run: `select cron.unschedule('process-knowlarity-webhook-queue')` then re-run setup SQL with correct secret

## check-forwarding-health
Fires daily at 21:30 UTC (3:00 AM IST). Configured in `vercel.json` - no Supabase setup needed.

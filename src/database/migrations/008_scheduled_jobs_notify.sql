-- Migration 008: LISTEN/NOTIFY trigger for scheduled_jobs live-reload
--
-- Fires pg_notify('scheduled_jobs_changed', json) on every INSERT, UPDATE, DELETE
-- so the notifier service can sync its in-process cron scheduler without restart.

CREATE OR REPLACE FUNCTION notify_scheduled_job_change()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
  IF TG_OP = 'DELETE' THEN
    payload = json_build_object(
      'action', 'delete',
      'job_id', OLD.id
    );
    PERFORM pg_notify('scheduled_jobs_changed', payload::text);
    RETURN OLD;
  ELSE
    payload = json_build_object(
      'action', lower(TG_OP),
      'job_id', NEW.id
    );
    PERFORM pg_notify('scheduled_jobs_changed', payload::text);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_scheduled_job_change
AFTER INSERT OR UPDATE OR DELETE ON scheduled_jobs
FOR EACH ROW
EXECUTE FUNCTION notify_scheduled_job_change();

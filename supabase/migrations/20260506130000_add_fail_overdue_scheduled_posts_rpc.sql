-- Force overdue scheduled posts to fail so past dates never remain scheduled.
CREATE OR REPLACE FUNCTION fail_overdue_scheduled_posts(p_brand_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer := 0;
BEGIN
  UPDATE content_calendar
  SET status = 'failed',
      last_error = COALESCE(last_error, 'Post missed its scheduled publish window before the publishing job ran.')
  WHERE brand_id = p_brand_id
    AND status = 'scheduled'
    AND post_date < now();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION fail_overdue_scheduled_posts(uuid) TO authenticated;

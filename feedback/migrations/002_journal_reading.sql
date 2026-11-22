-- Reading whole journals in the back office (docs/development/feedback-service.md):
-- the full history whatever its kind, one run's story, and the export.

-- The history newest first across kinds (the kind index serves one kind only);
-- scanned backwards, the export's (ts, id) keyset.
CREATE INDEX install_history_item_ts_idx ON install_history_item (install_id, ts DESC, id DESC);

-- The log's own order, now with its tie-breaker: newest first and the export's keyset.
CREATE INDEX install_log_item_ts_id_idx ON install_log_item (install_id, ts DESC, id DESC);
DROP INDEX install_log_item_ts_idx;

-- Every record of one run, oldest first.
CREATE INDEX install_history_item_run_idx ON install_history_item (install_id, run_id, ts);
CREATE INDEX install_log_item_run_idx ON install_log_item (install_id, run_id, ts);

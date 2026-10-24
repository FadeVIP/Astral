-- Run with the migration owner, never with credentials distributed to clients.
CREATE TABLE IF NOT EXISTS astral_documents (
  path text PRIMARY KEY,
  collection_path text NOT NULL,
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'object'),
  -- Preserve Firestore nanosecond versions exactly for optimistic concurrency.
  create_time text NOT NULL,
  update_time text NOT NULL
);
CREATE INDEX IF NOT EXISTS astral_documents_collection ON astral_documents(collection_path, path);
CREATE TABLE IF NOT EXISTS astral_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  document_count integer NOT NULL,
  source_sha256 text NOT NULL,
  source_consistent boolean NOT NULL
);
CREATE TABLE IF NOT EXISTS astral_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS astral_control (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
INSERT INTO astral_control(key,value) VALUES ('authority','"firestore"') ON CONFLICT DO NOTHING;
-- Realtime data is split by first child: changing one heartbeat/message never
-- rewrites the entire chat or presence tree.
CREATE TABLE IF NOT EXISTS astral_realtime (
  namespace text NOT NULL,
  node_key text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY(namespace,node_key)
);
CREATE TABLE IF NOT EXISTS astral_realtime_leases (
  id text PRIMARY KEY,
  uid text NOT NULL,
  principal jsonb NOT NULL,
  actions jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS astral_realtime_leases_expiry ON astral_realtime_leases(expires_at);

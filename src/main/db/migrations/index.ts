export interface Migration {
  version: number
  name: string
  sql: string
}

/** Keep SQL in TS so electron-vite bundles it into the main process. */
export const migrations: Migration[] = [
  {
    version: 1,
    name: '001_initial',
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  asin_or_sku TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (store_id, asin_or_sku)
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  version_kind TEXT NOT NULL DEFAULT 'original',
  md5 TEXT,
  width INTEGER,
  height INTEGER,
  byte_size INTEGER,
  is_locked INTEGER NOT NULL DEFAULT 0,
  is_trashed INTEGER NOT NULL DEFAULT 0,
  trashed_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, relative_path)
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, tag_id)
);

CREATE TABLE IF NOT EXISTS process_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'pending',
  template_id TEXT,
  payload_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS storage_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  provider TEXT NOT NULL,
  bucket TEXT,
  endpoint TEXT,
  public_base_url TEXT,
  secret_ref TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  storage_target_id INTEGER NOT NULL REFERENCES storage_targets(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (asset_id, storage_target_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor TEXT,
  target_type TEXT,
  target_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_assets_product ON assets(product_id);
CREATE INDEX IF NOT EXISTS idx_assets_md5 ON assets(md5);
CREATE INDEX IF NOT EXISTS idx_uploads_asset ON uploads(asset_id);
`
  },
  {
    version: 2,
    name: '002_sync',
    sql: `
CREATE TABLE IF NOT EXISTS sync_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  watch_folder TEXT,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  auto_start INTEGER NOT NULL DEFAULT 0,
  object_prefix TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT 'auto',
  bucket TEXT NOT NULL DEFAULT '',
  public_base_url TEXT NOT NULL DEFAULT '',
  access_key_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO sync_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS sync_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relative_path TEXT NOT NULL UNIQUE,
  md5 TEXT,
  object_key TEXT,
  public_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  byte_size INTEGER,
  synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_files_status ON sync_files(status);
CREATE INDEX IF NOT EXISTS idx_sync_files_md5 ON sync_files(md5);
`
  },
  {
    version: 3,
    name: '003_sync_provider_b2',
    sql: `
ALTER TABLE sync_settings ADD COLUMN provider TEXT NOT NULL DEFAULT 'b2';
ALTER TABLE sync_settings ADD COLUMN sse_mode TEXT NOT NULL DEFAULT '';
`
  },
  {
    version: 4,
    name: '004_skus',
    sql: `
CREATE TABLE IF NOT EXISTS skus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (sku)
);
`
  },
  {
    version: 5,
    name: '005_sku_images',
    sql: `
CREATE TABLE IF NOT EXISTS sku_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  sync_file_id INTEGER NOT NULL REFERENCES sync_files(id) ON DELETE CASCADE,
  is_cover INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (sku_id, sync_file_id)
);
CREATE INDEX IF NOT EXISTS idx_sku_images_sku ON sku_images(sku_id);
`
  },
  {
    version: 6,
    name: '006_sync_runs',
    sql: `
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  scanned INTEGER NOT NULL DEFAULT 0,
  uploaded INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  cancelled INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  watch_folder TEXT,
  bucket TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_finished ON sync_runs(finished_at DESC);
`
  },
  {
    version: 7,
    name: '007_sku_attrs',
    sql: `
ALTER TABLE skus ADD COLUMN category TEXT;
ALTER TABLE skus ADD COLUMN length_cm REAL;
ALTER TABLE skus ADD COLUMN width_cm REAL;
ALTER TABLE skus ADD COLUMN height_cm REAL;
ALTER TABLE skus ADD COLUMN gross_weight_kg REAL;
`
  },
  {
    version: 8,
    name: '008_sku_brand_barcode_net',
    sql: `
ALTER TABLE skus ADD COLUMN brand TEXT;
ALTER TABLE skus ADD COLUMN barcode TEXT;
ALTER TABLE skus ADD COLUMN net_weight_kg REAL;
`
  },
  {
    version: 9,
    name: '009_sync_files_trash',
    sql: `
ALTER TABLE sync_files ADD COLUMN is_trashed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_files ADD COLUMN trashed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_sync_files_trashed ON sync_files(is_trashed, trashed_at);
`
  }
]

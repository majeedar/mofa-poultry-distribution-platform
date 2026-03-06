-- PIRCMES Database Schema
-- 16 tables in dependency order
-- Feed Ghana Programme · MoFA Ghana · PPMED

-- Table 01: users
CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  full_name         VARCHAR(150) NOT NULL,
  phone_number      VARCHAR(20) NOT NULL UNIQUE,
  email             VARCHAR(150) UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  role              VARCHAR(30) NOT NULL,
  -- role: national_admin | national_officer | regional_officer | district_officer
  --       distributor | sp_operator | farmer | aea
  ghana_card_number VARCHAR(20) NOT NULL UNIQUE,
  -- Format: GHA-XXXXXXXXX-X (sole identifier, prevents double registration)
  region            VARCHAR(100),
  district          VARCHAR(100),
  is_active         BOOLEAN DEFAULT TRUE,
  last_login_at     TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- Table 02: aeas (created before farmers due to FK)
CREATE TABLE IF NOT EXISTS aeas (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  aea_number    VARCHAR(20) NOT NULL UNIQUE,
  district      VARCHAR(100) NOT NULL,
  region        VARCHAR(100) NOT NULL,
  supervisor_id INTEGER REFERENCES users(id),
  total_farmers INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Table 03: distributors
CREATE TABLE IF NOT EXISTS distributors (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  distributor_number  VARCHAR(20) NOT NULL UNIQUE,
  identity_barcode    VARCHAR(50) NOT NULL UNIQUE,
  vehicle_number      VARCHAR(20),
  gps_tracker_id      VARCHAR(50),
  assigned_region     VARCHAR(100),
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- Table 04: service_providers
CREATE TABLE IF NOT EXISTS service_providers (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id),
  sp_number       VARCHAR(20) NOT NULL UNIQUE,
  sp_name         VARCHAR(200) NOT NULL,
  sp_barcode      VARCHAR(50) NOT NULL UNIQUE,
  location_name   VARCHAR(200) NOT NULL,
  region          VARCHAR(100) NOT NULL,
  district        VARCHAR(100) NOT NULL,
  gps_lat         DECIMAL(10,8),
  gps_lng         DECIMAL(11,8),
  catchment_area  TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- Table 05: farmers
CREATE TABLE IF NOT EXISTS farmers (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER REFERENCES users(id),
  -- user_id is NULL for household farmers (USSD only)
  farmer_number     VARCHAR(20) NOT NULL UNIQUE,
  farmer_barcode    VARCHAR(50) NOT NULL UNIQUE,
  full_name         VARCHAR(150) NOT NULL,
  phone_number      VARCHAR(20) NOT NULL,
  gender            VARCHAR(10),
  production_tier   VARCHAR(20) NOT NULL,
  -- production_tier: anchor | small_medium | household
  sp_id             INTEGER NOT NULL REFERENCES service_providers(id),
  aea_id            INTEGER NOT NULL REFERENCES aeas(id),
  farm_name         VARCHAR(200),
  farm_location     VARCHAR(200) NOT NULL,
  region            VARCHAR(100) NOT NULL,
  district          VARCHAR(100) NOT NULL,
  farm_gps_lat      DECIMAL(10,8) NOT NULL,
  farm_gps_lng      DECIMAL(11,8) NOT NULL,
  flock_capacity    INTEGER,
  current_flock     INTEGER DEFAULT 0,
  has_tablet        BOOLEAN DEFAULT FALSE,
  collection_method VARCHAR(20) DEFAULT 'pickup',
  -- collection_method: pickup | delivery
  is_active         BOOLEAN DEFAULT TRUE,
  registered_by     INTEGER REFERENCES users(id),
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- Table 06: batch_barcodes
CREATE TABLE IF NOT EXISTS batch_barcodes (
  id                  SERIAL PRIMARY KEY,
  batch_barcode       VARCHAR(50) NOT NULL UNIQUE,
  distributor_id      INTEGER NOT NULL REFERENCES distributors(id),
  depot_officer_id    INTEGER NOT NULL REFERENCES users(id),
  loading_date        DATE NOT NULL,
  total_docs_loaded   INTEGER NOT NULL,
  num_sp_allocations  INTEGER NOT NULL,
  departure_gps_lat   DECIMAL(10,8),
  departure_gps_lng   DECIMAL(11,8),
  departure_time      TIMESTAMP,
  status              VARCHAR(30) DEFAULT 'loaded',
  -- status: loaded | en_route | partially_delivered | fully_delivered
  generated_on_device VARCHAR(100),
  synced_at           TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- Table 07: allocation_barcodes
CREATE TABLE IF NOT EXISTS allocation_barcodes (
  id                      SERIAL PRIMARY KEY,
  allocation_barcode      VARCHAR(50) NOT NULL UNIQUE,
  batch_id                INTEGER NOT NULL REFERENCES batch_barcodes(id),
  sp_id                   INTEGER NOT NULL REFERENCES service_providers(id),
  distributor_id          INTEGER NOT NULL REFERENCES distributors(id),
  docs_allocated          INTEGER NOT NULL,
  generated_at            TIMESTAMP DEFAULT NOW(),
  sp_notified_at          TIMESTAMP,
  barcode_on_sp_tablet    BOOLEAN DEFAULT FALSE,
  expected_arrival_time   TIMESTAMP,
  scanned_by_distributor  BOOLEAN DEFAULT FALSE,
  scanned_at              TIMESTAMP,
  docs_confirmed          INTEGER,
  discrepancy_flag        BOOLEAN DEFAULT FALSE,
  discrepancy_notes       TEXT,
  status                  VARCHAR(30) DEFAULT 'pending',
  -- status: pending | en_route | delivered | discrepancy
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);

-- Table 08: farmer_delivery_barcodes
CREATE TABLE IF NOT EXISTS farmer_delivery_barcodes (
  id                  SERIAL PRIMARY KEY,
  delivery_barcode    VARCHAR(100) NOT NULL UNIQUE,
  allocation_id       INTEGER NOT NULL REFERENCES allocation_barcodes(id),
  farmer_id           INTEGER NOT NULL REFERENCES farmers(id),
  sp_id               INTEGER NOT NULL REFERENCES service_providers(id),
  docs_allocated      INTEGER NOT NULL,
  generated_at        TIMESTAMP DEFAULT NOW(),
  farmer_notified_at  TIMESTAMP,
  barcode_on_tablet   BOOLEAN DEFAULT FALSE,
  collection_method   VARCHAR(20) NOT NULL,
  scanned_by_sp       BOOLEAN DEFAULT FALSE,
  scanned_at          TIMESTAMP,
  docs_delivered      INTEGER,
  farmer_signed       BOOLEAN DEFAULT FALSE,
  farmer_signature    TEXT,
  signed_at           TIMESTAMP,
  aea_notified        BOOLEAN DEFAULT FALSE,
  aea_notified_at     TIMESTAMP,
  status              VARCHAR(30) DEFAULT 'pending',
  -- status: pending | delivered | collected | discrepancy
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- Table 09: sp_receipts
CREATE TABLE IF NOT EXISTS sp_receipts (
  id                    SERIAL PRIMARY KEY,
  allocation_id         INTEGER NOT NULL UNIQUE REFERENCES allocation_barcodes(id),
  sp_id                 INTEGER NOT NULL REFERENCES service_providers(id),
  distributor_id        INTEGER NOT NULL REFERENCES distributors(id),
  docs_received         INTEGER NOT NULL,
  sp_signature          TEXT NOT NULL,
  signed_at             TIMESTAMP NOT NULL,
  receipt_gps_lat       DECIMAL(10,8),
  receipt_gps_lng       DECIMAL(11,8),
  condition_notes       TEXT,
  dead_on_arrival       INTEGER DEFAULT 0,
  national_notified     BOOLEAN DEFAULT FALSE,
  regional_notified     BOOLEAN DEFAULT FALSE,
  district_notified     BOOLEAN DEFAULT FALSE,
  notifications_sent_at TIMESTAMP,
  created_at            TIMESTAMP DEFAULT NOW()
);

-- Table 10: farmer_receipts
CREATE TABLE IF NOT EXISTS farmer_receipts (
  id                    SERIAL PRIMARY KEY,
  delivery_barcode_id   INTEGER NOT NULL UNIQUE REFERENCES farmer_delivery_barcodes(id),
  farmer_id             INTEGER NOT NULL REFERENCES farmers(id),
  sp_id                 INTEGER NOT NULL REFERENCES service_providers(id),
  docs_received         INTEGER NOT NULL,
  farmer_signature      TEXT NOT NULL,
  signed_at             TIMESTAMP NOT NULL,
  receipt_gps_lat       DECIMAL(10,8),
  receipt_gps_lng       DECIMAL(11,8),
  dead_on_receipt       INTEGER DEFAULT 0,
  condition_notes       TEXT,
  aea_notified          BOOLEAN DEFAULT FALSE,
  district_notified     BOOLEAN DEFAULT FALSE,
  national_notified     BOOLEAN DEFAULT FALSE,
  notifications_sent_at TIMESTAMP,
  created_at            TIMESTAMP DEFAULT NOW()
);

-- Table 11: daily_farm_entries
CREATE TABLE IF NOT EXISTS daily_farm_entries (
  id                  SERIAL PRIMARY KEY,
  farmer_id           INTEGER NOT NULL REFERENCES farmers(id),
  entry_date          DATE NOT NULL,
  birds_alive         INTEGER NOT NULL,
  birds_added         INTEGER DEFAULT 0,
  mortality_count     INTEGER DEFAULT 0,
  feed_consumed_kg    DECIMAL(8,2),
  water_consumed_l    DECIMAL(8,2),
  vaccine_given       BOOLEAN DEFAULT FALSE,
  vaccine_type        VARCHAR(100),
  health_flags        TEXT,
  observations        TEXT,
  entry_method        VARCHAR(20) DEFAULT 'tablet',
  -- entry_method: tablet | ussd | aea_entry
  submitted_by        INTEGER REFERENCES users(id),
  submitted_at        TIMESTAMP,
  is_compliant        BOOLEAN DEFAULT FALSE,
  mortality_evidenced BOOLEAN DEFAULT FALSE,
  aea_notified        BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMP DEFAULT NOW(),
  UNIQUE (farmer_id, entry_date)
);

-- Table 12: mortality_evidence
CREATE TABLE IF NOT EXISTS mortality_evidence (
  id                           SERIAL PRIMARY KEY,
  daily_entry_id               INTEGER NOT NULL REFERENCES daily_farm_entries(id),
  farmer_id                    INTEGER NOT NULL REFERENCES farmers(id),
  aea_id                       INTEGER NOT NULL REFERENCES aeas(id),
  farmer_count                 INTEGER NOT NULL,
  photo_path                   VARCHAR(500) NOT NULL,
  photo_taken_at               TIMESTAMP,
  photo_gps_lat                DECIMAL(10,8),
  photo_gps_lng                DECIMAL(11,8),
  ocr_count                    INTEGER,
  ocr_confidence               DECIMAL(5,2),
  ocr_status                   VARCHAR(30) DEFAULT 'pending',
  -- ocr_status: pending | confirmed | flagged | unreadable
  count_match                  BOOLEAN,
  variance_percent             DECIMAL(5,2),
  is_flagged                   BOOLEAN DEFAULT FALSE,
  flag_reason                  VARCHAR(200),
  mortality_threshold_exceeded BOOLEAN DEFAULT FALSE,
  aea_notified                 BOOLEAN DEFAULT FALSE,
  aea_notified_at              TIMESTAMP,
  aea_visit_required           BOOLEAN DEFAULT FALSE,
  aea_reviewed                 BOOLEAN DEFAULT FALSE,
  aea_review_notes             TEXT,
  aea_reviewed_at              TIMESTAMP,
  created_at                   TIMESTAMP DEFAULT NOW(),
  updated_at                   TIMESTAMP DEFAULT NOW()
);

-- Table 13: aea_visits
CREATE TABLE IF NOT EXISTS aea_visits (
  id                    SERIAL PRIMARY KEY,
  aea_id                INTEGER NOT NULL REFERENCES aeas(id),
  farmer_id             INTEGER NOT NULL REFERENCES farmers(id),
  visit_date            DATE NOT NULL,
  visit_type            VARCHAR(30) NOT NULL,
  -- visit_type: routine_weekly | mortality_followup | flagged_visit | registration
  trigger_event_id      INTEGER REFERENCES mortality_evidence(id),
  geofence_lat          DECIMAL(10,8) NOT NULL,
  geofence_lng          DECIMAL(11,8) NOT NULL,
  distance_from_farm_m  DECIMAL(8,2) NOT NULL,
  geofence_passed       BOOLEAN NOT NULL,
  form_unlocked_at      TIMESTAMP,
  form_submitted_at     TIMESTAMP,
  visit_duration_mins   INTEGER,
  birds_alive_observed  INTEGER,
  mortality_verified    BOOLEAN,
  mortality_photo_path  VARCHAR(500),
  health_assessment     TEXT,
  recommendations       TEXT,
  flag_resolved         BOOLEAN DEFAULT FALSE,
  followup_required     BOOLEAN DEFAULT FALSE,
  synced_at             TIMESTAMP,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- Table 14: notifications
CREATE TABLE IF NOT EXISTS notifications (
  id            SERIAL PRIMARY KEY,
  recipient_id  INTEGER NOT NULL REFERENCES users(id),
  trigger_type  VARCHAR(50) NOT NULL,
  trigger_table VARCHAR(50) NOT NULL,
  trigger_id    INTEGER NOT NULL,
  channel       VARCHAR(20) NOT NULL,
  -- channel: push | sms | both
  message_title VARCHAR(200) NOT NULL,
  message_body  TEXT NOT NULL,
  sent_at       TIMESTAMP,
  delivered_at  TIMESTAMP,
  is_delivered  BOOLEAN DEFAULT FALSE,
  is_read       BOOLEAN DEFAULT FALSE,
  read_at       TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Table 15: audit_logs (NEW)
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  actor_id    INTEGER REFERENCES users(id),
  actor_role  VARCHAR(30),
  action      VARCHAR(20) NOT NULL,
  -- action: created | updated | deleted | approved | rejected | login
  table_name  VARCHAR(100) NOT NULL,
  record_id   INTEGER,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Table 16: registration_requests (NEW)
CREATE TABLE IF NOT EXISTS registration_requests (
  id                SERIAL PRIMARY KEY,
  ghana_card_number VARCHAR(20) NOT NULL,
  requested_role    VARCHAR(30) NOT NULL,
  submitted_data    JSONB NOT NULL,
  submitted_by      INTEGER REFERENCES users(id),
  status            VARCHAR(20) DEFAULT 'pending',
  -- status: pending | approved | rejected
  reviewed_by       INTEGER REFERENCES users(id),
  review_notes      TEXT,
  reviewed_at       TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_farmers_sp_id ON farmers(sp_id);
CREATE INDEX IF NOT EXISTS idx_farmers_aea_id ON farmers(aea_id);
CREATE INDEX IF NOT EXISTS idx_daily_entries_farmer_date ON daily_farm_entries(farmer_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name, created_at);
CREATE INDEX IF NOT EXISTS idx_registration_requests_status ON registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_registration_requests_card ON registration_requests(ghana_card_number);
CREATE INDEX IF NOT EXISTS idx_allocation_batch ON allocation_barcodes(batch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_farmer ON farmer_delivery_barcodes(farmer_id);
CREATE INDEX IF NOT EXISTS idx_mortality_entry ON mortality_evidence(daily_entry_id);
CREATE INDEX IF NOT EXISTS idx_aea_visits_aea ON aea_visits(aea_id, visit_date);

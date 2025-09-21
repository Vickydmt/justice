-- Organizations and Users
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('admin','reviewer','viewer')),
  created_at timestamptz not null default now()
);

-- Documents and Pages
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  original_filename text not null,
  mime_type text not null,
  page_count int not null default 1,
  status text not null default 'uploaded' check (status in ('uploaded','processing','ready','reviewing','approved','rejected','exported')),
  meta jsonb not null default '{}',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  page_number int not null,
  width int,
  height int,
  storage_path text, -- e.g., blob:// or s3:// path for rendered page image
  created_at timestamptz not null default now(),
  unique(document_id, page_number)
);

-- Detections and Redactions
create table if not exists detections (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  page_number int not null,
  label text not null, -- e.g., SSN, Name, Account Number, Signature
  confidence double precision not null check (confidence between 0 and 1),
  bbox jsonb not null, -- {x,y,w,h} in pixel coords
  model text not null,
  created_at timestamptz not null default now()
);

create table if not exists redactions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  page_number int not null,
  detection_id uuid references detections(id) on delete set null,
  label text not null,
  bbox jsonb not null,
  reason text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- Reviews and Exports
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  reviewer_id uuid references users(id),
  stage text not null default 'initial' check (stage in ('initial','secondary','final')),
  decision text check (decision in ('approved','rejected')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists exports (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  format text not null check (format in ('pdf','tiff','png')),
  storage_path text not null,
  checksum text,
  created_at timestamptz not null default now()
);

-- Audit log
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references users(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Taxonomy (optional, extendable)
create table if not exists taxonomy_labels (
  id serial primary key,
  code text not null unique, -- e.g., SSN, SIGNATURE
  description text
);

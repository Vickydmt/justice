-- Enable RLS
alter table organizations enable row level security;
alter table users enable row level security;
alter table documents enable row level security;
alter table document_pages enable row level security;
alter table detections enable row level security;
alter table redactions enable row level security;
alter table reviews enable row level security;
alter table exports enable row level security;
alter table audit_logs enable row level security;

-- Example policies (replace current_setting with your tenant context or JWT claims)
-- Require org match for reads
create policy if not exists org_read_documents on documents
  for select using (org_id::text = current_setting('app.org_id', true));

create policy if not exists org_mod_documents on documents
  for all using (org_id::text = current_setting('app.org_id', true))
  with check (org_id::text = current_setting('app.org_id', true));

-- Repeat similarly as needed for other tables:
create policy if not exists org_read_detections on detections
  for select using (
    exists (select 1 from documents d where d.id = detections.document_id and d.org_id::text = current_setting('app.org_id', true))
  );

create policy if not exists org_mod_detections on detections
  for all using (
    exists (select 1 from documents d where d.id = detections.document_id and d.org_id::text = current_setting('app.org_id', true))
  )
  with check (
    exists (select 1 from documents d where d.id = detections.document_id and d.org_id::text = current_setting('app.org_id', true))
  );

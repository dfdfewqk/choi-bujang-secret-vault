-- BYTE BACK Step 2. For a dedicated table inside the existing pds-diary-t06 project.
-- Table content is synthetic, and neither DB passwords nor server API keys belong in GitHub.
create table if not exists public.vault_training_notes (
  id bigint generated always as identity primary key,
  owner_id uuid null,
  sort_order integer not null unique check (sort_order between 1 and 4),
  title text not null,
  content text not null
);
alter table public.vault_training_notes enable row level security;
revoke all on table public.vault_training_notes from public, anon, authenticated;
revoke all on sequence public.vault_training_notes_id_seq from public, anon, authenticated;
grant select on table public.vault_training_notes to service_role;
-- There are deliberately no SELECT policies for anon or authenticated.
-- Seed 4 synthetic records separately in the SQL Editor, not in the public repository.

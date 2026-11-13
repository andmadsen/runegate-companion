-- Regeldata leveres fra et privat lager, så regelbogens tekst kun kan hentes af brugere,
-- der er logget ind (D4). Filen lægges i bucket "rules" som <version>/rules.json.
insert into storage.buckets (id, name, public)
values ('rules', 'rules', false)
on conflict (id) do nothing;

create policy rules_read on storage.objects for select to authenticated
  using (bucket_id = 'rules');

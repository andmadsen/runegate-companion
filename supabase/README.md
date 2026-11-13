# Database (Supabase)

- `migrations/` – databaseskemaet. Køres i rækkefølge mod Supabase-projektet.
- `tests/` – test af migration og adgangsregler på en lokal Postgres:

```bash
psql -d testdb -f tests/supabase_stub.sql
psql -d testdb -f migrations/20261114000000_init.sql
psql -d testdb -f tests/rls_test.sql     # udskriver "RLS OK"
```

SECURITY SUMMARY

- Supabase passwords are handled by Supabase Auth.
- Secret keys stay only in Vercel environment variables.
- The browser receives only the publishable Supabase key.
- Wallet changes are performed by authenticated Vercel API routes.
- Wallet writes use an atomic PostgreSQL function.
- Transaction reference IDs prevent accidental duplicate charges.
- Stripe webhook IDs prevent duplicate payment credits.
- Cookie Coins are virtual entertainment credits with no cash value.

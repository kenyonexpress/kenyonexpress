-- preflight 318: read-only. Expect club_tiers present, club_tier_benefits absent.
select to_regclass('public.club_tiers') is not null as club_tiers_exists,
       to_regclass('public.club_tier_benefits') is null as benefits_absent;

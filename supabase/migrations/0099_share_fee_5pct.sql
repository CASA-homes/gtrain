-- 0099 · Share trading fee cut to 5% each way (G-Train), and 5% as the default for new leagues. The 10% tax on profit
-- stays. Break-even for a buyer drops from about +24% to about +11%.
update public.kc_settings set share_fee_pct = 5 where league_id = 1;
alter table public.kc_settings alter column share_fee_pct set default 5;

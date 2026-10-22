-- Rowan Marshall in Geelong kit (AFL Photos, 9 Oct 2026, after his trade from St Kilda)
update public.players set photo_path = 'https://resources.afl.com.au/photo-resources/2026/10/08/7907dcd9-a48d-4bac-9601-5978448e2951/HjGlTo7c.jpg?width=1200&height=630'
where name = 'R. Marshall' and afl_club = 'GEE';
select name, afl_club, photo_path from public.players where name = 'R. Marshall';

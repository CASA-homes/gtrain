-- Traded players in their new club kits (headshots edited with Higgsfield, 22 Oct 2026)
update public.players p set photo_path = v.url
from (values
('Z. Butters','WBD','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_045034_0487523c-be09-4986-aca6-94222ce04dae.png'),
('N. O''Driscoll','RIC','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_044853_1b9b5951-5495-49ed-996e-1ac2571b74e2.png'),
('L. Pedlar','PTA','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_044855_1bc50eea-7af1-4e7b-9909-c6bc7b4234d8.png'),
('L. Whitfield','CAR','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_044854_503ead26-80f8-4aa8-898f-ac7354a0eac9.png'),
('K. Coleman','ESS','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_044854_5a3e8b78-6f55-4f28-9805-84a1427955ab.png'),
('T. Greene','GEE','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_045118_8845a497-7e51-4c1d-a2db-beddb9de5e80.png'),
('R. Marshall','GEE','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_044854_1166fd62-b01f-4f84-b018-ab1566a61ced.png'),
('T. Rivers','WCE','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_045034_9aae3d39-ac5d-47d2-a624-8f5ad9fa0865.png'),
('Z. Merrett','HAW','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_045034_d6f28f14-76e1-4bd2-bcfd-0d8a0a0d51a3.png'),
('S. Pendlebury','GCS','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_044854_b7611100-c236-4e5d-9032-c58d49a8d4da.png'),
('K. Briggs','RIC','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_045042_1a96ad82-4dac-4edd-b0ee-2c26e1112287.png'),
('J. Ridley','GEE','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_044856_a816e92c-6042-42cb-aa66-7005c542a4d7.png'),
('J. Bowes','ESS','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_045042_3e227fd3-65f2-4d2d-8a74-41a0a818acf3.png'),
('S. Marshall','STK','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_045042_6dc06d0d-6902-4d73-b04a-3a06aa929306.png'),
('N. Blakey','NTH','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_045050_99952baa-b543-43c9-90b2-4ff99eb314e7.png'),
('L. Neale','COL','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_045051_d327a9a9-9a25-469e-bbc5-364d1a135237.png'),
('J. Viney','WCE','https://d8j0ntlcm91z4.cloudfront.net/user_3C3tDHWEbLUnWrsdxoCVtPMt4ja/hf_20261022_045050_a056d17e-da84-4209-b2b8-b54b754f396e.png')
) as v(name, club, url)
where p.name = v.name and p.afl_club = v.club;
select count(*) as updated from public.players where photo_path like '%cloudfront%';

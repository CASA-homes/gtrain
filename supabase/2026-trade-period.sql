-- 2026 AFL trade & free agency period: move rostered players to their new AFL clubs.
-- Source: afl.com.au Trade Tracker (all 30 moves, period closed 14 Oct 2026). Only G-Train-rostered players are listed.
update public.players p set afl_club = v.new_club
from (values
('Pato''s Fantasy Team','L. Pedlar','ADE','PTA'),
('Bodega Boys','K. Coleman','BRL','ESS'),
('Such Is Fyfe','T. Rivers','MEL','WCE'),
('Bito’s Boys','J. Viney','MEL','WCE'),
('Bodega Boys','L. Whitfield','GWS','CAR'),
('NSW-ACT Academy','N. Blakey','SYD','NTH'),
('Fo’ Sheezel my Neezel','S. Marshall','BRL','STK'),
('Ram Dawgs','Z. Butters','PTA','WBD'),
('Such Is Fyfe','R. Marshall','STK','GEE'),
('Fo’ Sheezel my Neezel','J. Ridley','ESS','GEE'),
('Fo’ Sheezel my Neezel','J. Bowes','GEE','ESS'),
('Ram Dawgs','N. O''Driscoll','FRE','RIC'),
('Muzza''s Murabito''s','Z. Merrett','ESS','HAW'),
('A Brayshaw Thing','S. Pendlebury','COL','GCS'),
('Bito’s Boys','L. Neale','BRL','COL'),
('Fo’ Sheezel my Neezel','K. Briggs','GWS','RIC'),
('Serong So’Right','T. Greene','GWS','GEE')
) as v(team, name, old_club, new_club)
join public.teams t on t.name = v.team
join public.squad s on s.team_id = t.id
where s.player_id = p.id and p.name = v.name and p.afl_club = v.old_club;

select p.name, p.afl_club, t.name as gtrain_team from public.players p join public.squad s on s.player_id = p.id join public.teams t on t.id = s.team_id
where p.name in ('L. Pedlar', 'K. Coleman', 'T. Rivers', 'J. Viney', 'L. Whitfield', 'N. Blakey', 'S. Marshall', 'Z. Butters', 'R. Marshall', 'J. Ridley', 'J. Bowes', 'N. O''Driscoll', 'Z. Merrett', 'S. Pendlebury', 'L. Neale', 'K. Briggs', 'T. Greene') order by t.name, p.name;

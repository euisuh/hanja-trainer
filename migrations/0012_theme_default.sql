-- profile is a single-row table (id=1); nobody has ever explicitly chosen
-- 'default' through the ThemePicker UI added in #80 — it was only ever the
-- unset fallback. Flip the fallback itself. Anyone who explicitly picked
-- 'default' after trying quiet-technical would need to re-pick it, but no
-- such choice has been possible before this migration ships.
UPDATE profile SET theme = 'quiet-technical' WHERE theme = 'default';

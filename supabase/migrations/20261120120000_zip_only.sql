-- We only ask for a ZIP code now. Keep the ZIP from any saved street address and drop the rest.
alter table profiles add column zip text check (zip ~ '^\d{5}$');

update profiles
set zip = substring(address from '(\d{5})(?:-\d{4})?\s*$')
where address is not null;

alter table profiles drop column address;

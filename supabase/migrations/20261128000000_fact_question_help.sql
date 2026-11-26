alter table public.facts add column help_text text;

-- California Department of Insurance
-- https://www.insurance.ca.gov/01-consumers/105-type/5-residential/index.cfm
update public.facts
set help_text = 'The California FAIR Plan provides basic property insurance when regular insurers won’t cover a property. Look for “California FAIR Plan” on your policy documents.'
where question ilike '%California FAIR Plan%';

-- California State Water Resources Control Board
-- https://www.waterboards.ca.gov/drinking_water/programs/districts/docs/tulare/designing-water-system-consolidation-projects.pdf
update public.facts
set help_text = 'A mutual water company is a water supplier owned by its shareholders, often local property owners. Check the provider name on your water bill or ask your landlord or property manager.'
where question ilike '%mutual water company%';

update public.facts
set help_text = 'This means health coverage through a large employer’s group plan. If you’re unsure how the plan is classified, check the benefits materials or ask the employer’s benefits team.'
where question ilike '%child under 21%large employer health plan%';

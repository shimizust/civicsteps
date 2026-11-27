-- Assessments use the user's city or state, which can change when they switch ZIPs.
alter table personal_assessments add column place text;

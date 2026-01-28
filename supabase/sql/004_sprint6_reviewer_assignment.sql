alter table offboarding_cases
  add column if not exists reviewer_user_id uuid;

alter table offboarding_cases
  add constraint offboarding_cases_reviewer_org_member_fk
  foreign key (org_id, reviewer_user_id)
  references org_members(org_id, user_id);

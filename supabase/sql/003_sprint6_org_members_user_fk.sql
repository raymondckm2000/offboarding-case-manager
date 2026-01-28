alter table org_members
  drop constraint if exists org_members_user_id_fkey;

alter table org_members
  add constraint org_members_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

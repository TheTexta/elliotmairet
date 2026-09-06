create table public.site_content (
	singleton boolean primary key default true check (singleton),
	footer_text text not null check (char_length(footer_text) <= 2000),
	updated_at timestamptz not null default timezone('utc', now())
);

insert into public.site_content (footer_text)
values (E'Elliot Mairet is a Montreal based photographer from Victoria BC.\n\nAbove all else he is grateful for you');

revoke all on public.site_content from public, anon, authenticated;
grant select on public.site_content to anon, authenticated;
grant update (footer_text, updated_at) on public.site_content to authenticated;
grant all on public.site_content to service_role;

alter table public.site_content enable row level security;

create policy "public site content read"
	on public.site_content for select
	to anon, authenticated
	using (true);

create policy "admin site content update"
	on public.site_content for update
	to authenticated
	using ((select public.is_admin()))
	with check ((select public.is_admin()));

notify pgrst, 'reload schema';

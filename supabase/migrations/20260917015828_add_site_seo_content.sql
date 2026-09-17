alter table public.site_content
	add column seo_title text check (seo_title is null or char_length(seo_title) <= 120),
	add column seo_description text check (seo_description is null or char_length(seo_description) <= 320);

grant update (seo_title, seo_description, updated_at) on public.site_content to authenticated;

notify pgrst, 'reload schema';

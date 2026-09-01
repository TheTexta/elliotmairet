alter table private.admin_users
	drop constraint admin_users_pkey,
	drop constraint admin_users_singleton_check,
	drop constraint admin_users_user_id_key,
	drop column singleton,
	add primary key (user_id);

UPDATE auth.users SET email = 'admin@gpabr.com', email_change = ''
WHERE email = '0001@gpabr.com';

UPDATE public.users SET email = 'admin@gpabr.com'
WHERE email = '0001@gpabr.com';

UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{email}', '"admin@gpabr.com"')
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'admin@gpabr.com');

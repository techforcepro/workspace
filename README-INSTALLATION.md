# TechForce Workspace V1

A responsive Supabase-backed workspace access portal. V1 includes:
- Email/password registration and sign-in
- Google OAuth sign-in
- User dashboard and access request workflow
- Admin console with pending requests, user list, preset/custom expiry, grant/extend and revoke
- Database-side role checks, RLS, access RPCs and admin audit log
- CodeSpace placeholder for later integration

## 1. Create the Supabase project
1. Create a project at https://supabase.com/dashboard.
2. Open Project Settings > API (or Data API / API Keys depending on dashboard version).
3. Copy the Project URL and publishable key (or legacy anon key).
4. Paste them into `assets/js/config.js`.
5. Do not use the service_role / secret key in browser code.

## 2. Create the database
1. Open SQL Editor in Supabase.
2. Open `supabase/schema.sql` in a text editor.
3. Copy all SQL and run it.
4. Confirm the query succeeds.

## 3. Create the admin account
1. Open the website and register `business.techforce@gmail.com`.
2. Confirm that email using the Supabase confirmation email if confirmation is enabled.
3. Sign in once.
4. In Supabase SQL Editor, run:
   `update public.profiles set role='admin' where lower(email)='business.techforce@gmail.com';`
5. Sign out and sign in again. Open `/admin/index.html`.

This bootstrap SQL is intentionally separate: no one can become admin merely by typing the admin email into a registration form.

## 4. Configure authentication
In Supabase > Authentication > URL Configuration:
- Set Site URL to your deployed website root, e.g. `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.
- Add that root and the following redirect path to Redirect URLs:
  `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/dashboard/index.html`
- For local testing, add your local development URL and its `/dashboard/index.html` path too.

Email/password:
- Supabase > Authentication > Sign In / Providers > Email: enable Email provider.
- For testing, you may temporarily disable email confirmation. For public use, keep confirmation enabled and configure SMTP/custom email delivery.

Google:
1. In Google Cloud Console, create/select a project.
2. Configure OAuth consent screen.
3. Create an OAuth Client ID of type Web application.
4. Add Supabase's callback URL shown in Supabase > Authentication > Providers > Google as an Authorized redirect URI in Google Cloud.
5. Enable Google provider in Supabase and paste the Google Client ID and Client Secret there.
6. Add your website URL to the allowed redirect URLs in Supabase.
7. Test Google login on the deployed HTTPS website.

## 5. Deploy (GitHub Pages)
1. Extract the ZIP.
2. Upload the contents of `TECHFORCE-WORKSPACE` into a new GitHub repository (the `index.html` should be at repository root).
3. In GitHub repository Settings > Pages, deploy from your main branch and root folder.
4. Open the generated HTTPS website URL.
5. If hosted in a repository subfolder, the relative links in this project work as long as all files retain their folders.

## 6. Android-friendly setup
You can do the setup from Android:
1. Download and extract the ZIP using your file manager.
2. Open GitHub in Chrome, create a repository, and use Add file > Upload files to upload the extracted folders/files. If uploading folders is awkward, use GitHub's web upload or an Android code editor that supports folder upload.
3. Edit `assets/js/config.js` on GitHub using the pencil icon and paste the Supabase URL/key.
4. Run SQL in Supabase using Chrome in desktop-site mode if needed.
5. Configure Google OAuth from Google Cloud Console in Chrome.
6. Open the deployed GitHub Pages URL.

## 7. Test the workflow
1. Register a normal test account and confirm email if required.
2. Sign in and tap Request workspace access.
3. Sign in as `business.techforce@gmail.com` and open Admin console.
4. Review the request and grant 1 hour, 1 day, 7 days, 30 days or custom expiry.
5. Return to the test account dashboard; status should become Active.
6. Revoke from admin panel; test account should show Revoked.
7. Grant a short expiry and verify it becomes Expired after the time passes.

## Important security notes
- The frontend publishable/anon key is expected; database security comes from RLS and server-side checks.
- Never expose the Supabase service_role / secret key.
- Admin access is determined by `profiles.role`, not by a frontend email comparison.
- Grant/revoke/reject actions are security-definer RPCs that verify the caller's admin role and write audit records.
- Access status in the dashboard is informational. Every future protected CodeSpace API, database operation, file endpoint or Edge Function must independently verify `has_workspace_access()` / equivalent server-side authorization. Hiding a button is not security.
- This V1 does not yet implement a remote code editor, project file storage, terminal or isolated execution environment. Those are V2.
- For production, enable email confirmation, configure custom SMTP, set appropriate rate limits/CAPTCHA, and review Supabase security advisor.

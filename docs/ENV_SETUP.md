# Environment setup: logins, n8n auth, Gmail

Run the commands in the repo folder. Never commit real values; `.env` and `.env.*` are gitignored.

## 1. Logins

**Session secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**One password hash per person** (swap in the real password):
```bash
node -e "console.log(require('bcryptjs').hashSync('YourPassword123',10))"
```

**`.env` / `.env.local`**: put `DASHBOARD_USERS` on a single line and **escape every `$` as `\$`**. Bcrypt hashes contain `$`, and Vite's env loader expands `$...` as a variable even inside single quotes, which silently corrupts the hash (login then always fails). The server logs `passwordHash ... is not a valid bcrypt hash` when this happens.
```env
SESSION_SECRET=paste_the_64_char_hex_here
DASHBOARD_USERS=[{"email":"rishi@rareglobalfood.com","name":"Rishi","role":"admin","passwordHash":"\$2a\$10\$..."},{"email":"sales@rareglobalfood.com","name":"Sales","role":"agent","passwordHash":"\$2a\$10\$..."}]
ACTIONS_DRY_RUN=true
```

Roles:
- `admin`: bulk campaigns
- `agent`: single-lead sends and replies
- `viewer`: read only

Give the manager `admin` and the sales team `agent`.

## 2. n8n auth

1. In n8n, open the **Lead Generation Webhook Auth** credential. It's the Header Auth credential the bulk and opener webhooks check.
2. If n8n hides the value, open **[LEAD GEN] Cliq Email Command Handler**, then the **Trigger Email Campaign** node. The same value is typed in plain text in its `Authorization` header.
3. Copy it exactly, with nothing added. Only include `Bearer ` if it's already part of the value.
   ```env
   N8N_WEBHOOK_AUTH=the_exact_value
   ```

## 3. Gmail re-authorisation

**Check what the current token can do.** Get an access token from the refresh token, then:
```bash
curl "https://oauth2.googleapis.com/tokeninfo?access_token=ACCESS_TOKEN"
```
If `scope` shows only `gmail.readonly`, it can't send.

**Get a new refresh token with OAuth Playground:**
1. In Google Cloud Console, open the OAuth client the dashboard uses (`GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`). Under **Authorized redirect URIs**, add `https://developers.google.com/oauthplayground`.
2. Go to developers.google.com/oauthplayground and click ⚙️. Tick **Use your own OAuth credentials** and paste the client ID and secret.
3. In Step 1, enter both scopes:
   ```
   https://www.googleapis.com/auth/gmail.modify
   https://www.googleapis.com/auth/gmail.send
   ```
   Click **Authorize APIs** and sign in as the **mailbox the dashboard reads**, not a personal account.
4. In Step 2, click **Exchange authorization code for tokens**. Copy the **refresh token** into `GMAIL_REFRESH_TOKEN`.

**Watch out for the 7-day expiry.** If the OAuth consent screen is in **Testing** mode, Google expires refresh tokens after 7 days and the Email tab breaks again. Set it to **In production**, or **Internal** for a Workspace account.

## 4. Vercel

Add these in Vercel → Project → **Settings → Environment Variables**, for Production (and Preview if used):
- `SESSION_SECRET`
- `DASHBOARD_USERS` (paste the raw JSON in Vercel's field: **no** quotes and **no** `\$` escaping)
- `N8N_WEBHOOK_AUTH`
- `GMAIL_REFRESH_TOKEN` (the new one)
- `ACTIONS_DRY_RUN=true`

Environment changes don't apply to existing deployments. Go to **Redeploy**, untick **Use existing build cache**, and make sure it builds the latest commit.

If sign-in returns **503** ("Sign-in is temporarily unavailable"), check the deployment's server logs for `[auth] configuration error`. Set `DASHBOARD_USERS` to valid account JSON with complete bcrypt hashes and `SESSION_SECRET` to at least 16 characters in the environment serving the URL (Production or Preview), then redeploy. A **401** ("Invalid email or password") means usable accounts are configured, but the submitted credentials do not match them. Local `.env.local` credentials do not configure Vercel's deployed environment.

Leave `ACTIONS_DRY_RUN=true` until the click-through is done. When switching it to `false`, test one single-lead send to your own number before any bulk run.

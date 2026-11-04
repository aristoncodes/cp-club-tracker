# Setup: taking CP Club Tracker live

Every service here is free and needs no credit card. Do the parts in order; each part uses values from the one before it. Run commands from the repo root unless a step says otherwise.

Keep a private note of the values you collect. None of them go in the repo except where a step says so.

## 1. Create the accounts (only you can do this)

- [ ] [Cloudflare](https://dash.cloudflare.com/sign-up)
- [ ] [GitHub](https://github.com/signup): create a **public** repo. Public repos get free Actions minutes. Your commit name and email become public with it.
- [ ] [Expo](https://expo.dev/signup)
- [ ] [Google Cloud](https://console.cloud.google.com): create a project
- [ ] [Firebase](https://console.firebase.google.com): add a project (you can pick the same Google Cloud project)

## 2. Make the secrets

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # INGEST_SECRET
node -e "const c=require('crypto').createECDH('prime256v1');c.generateKeys();console.log('VAPID_PUBLIC_KEY='+c.getPublicKey('base64url'));console.log('VAPID_PRIVATE_KEY='+c.getPrivateKey('base64url'))"
```

## 3. Database and Worker

```bash
cd api
pnpm exec wrangler login
pnpm exec wrangler d1 create cp-tracker
```

1. Copy the printed `database_id` into [api/wrangler.toml](api/wrangler.toml).
2. Create the production tables:
   ```bash
   pnpm exec wrangler d1 migrations apply cp-tracker --remote
   ```
3. Deploy, and note the `https://cp-tracker-api.<you>.workers.dev` URL. This is your **API URL**:
   ```bash
   pnpm exec wrangler deploy
   ```

## 4. Website

Build and deploy it once, so that it has an address (replace `<you>` with your subdomain):

```bash
cd web
echo "VITE_API_URL=https://cp-tracker-api.<you>.workers.dev" > .env.production
pnpm build
../api/node_modules/.bin/wrangler deploy
```

Note the `https://cp-club-web.<you>.workers.dev` URL. This is your **web URL**. Then set `WEB_ORIGIN` in [api/wrangler.toml](api/wrangler.toml) to it.

Don't use `wrangler pages project create`. New Pages projects are now Workers, and running it from `api/` deploys a second copy of the API.

## 5. Google sign-in

In Google Cloud, under **APIs & Services → Credentials**, configure the consent screen, then create two OAuth client IDs:

- [ ] **Web application.** Authorized JavaScript origins: your web URL and `http://localhost:5173`.
- [ ] **Android.** Package name `com.cpclub.tracker`. For the SHA-1, run `eas credentials` in `app/` after step 6. Under the client's **Advanced settings**, turn on **custom URI scheme**.

## 6. Expo and Firebase

```bash
npm i -g eas-cli
cd app
eas login
eas init
eas update:configure
```

1. In Firebase, add an **Android app** with package `com.cpclub.tracker`. Download `google-services.json` to `app/`.
2. Add `"googleServicesFile": "./google-services.json"` under `android` in [app/app.json](app/app.json).
3. In Firebase, go to **Project settings → Service accounts** and generate a private key. Upload it with `eas credentials` (Android → Push Notifications → FCM V1). **Don't commit this key.**
4. Set the values in [app/eas.json](app/eas.json): `EXPO_PUBLIC_API_URL` to your API URL, and `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` to the Android client ID.

## 7. Worker secrets

From `api/`, run this for each one and paste the value when asked:

```bash
pnpm exec wrangler secret put SESSION_SECRET
```

| Secret | Value |
|---|---|
| `SESSION_SECRET` | From step 2 |
| `INGEST_SECRET` | From step 2 |
| `ADMIN_EMAILS` | Your Google email; separate several with commas |
| `GOOGLE_CLIENT_IDS` | Web client ID and Android client ID, separated by a comma |
| `GITHUB_REPO` | `your-username/your-repo` |
| `GITHUB_TOKEN` | A [fine-grained token](https://github.com/settings/personal-access-tokens) for this repo only, with **Actions: Read and write** |
| `VAPID_PUBLIC_KEY` | From step 2 |
| `VAPID_PRIVATE_KEY` | From step 2 |
| `BREVO_API_KEY` | From a free [Brevo](https://www.brevo.com) account, under SMTP & API → API keys |
| `EMAIL_FROM` | The sender address you verified in Brevo |

Then deploy again from `api/`, because `WEB_ORIGIN` changed:

```bash
pnpm exec wrangler deploy
```

## 8. GitHub

1. Under the repo's **Settings → Secrets and variables → Actions**, add `API_URL` (your API URL) and `INGEST_SECRET`.
2. Push the code:
   ```bash
   git remote add origin https://github.com/your-username/your-repo.git
   git push -u origin main
   ```
3. Under **Actions**, run **sync-contests** by hand once. Contests should then appear on the app and website.

## 9. Build and publish the app and website

```bash
cd app && eas build -p android --profile preview
```

Copy the APK link it gives you, then create `web/.env.production`:

```
VITE_API_URL=your API URL
VITE_GOOGLE_CLIENT_ID=your web client ID
VITE_APK_URL=your APK link
VITE_VAPID_PUBLIC_KEY=from step 2
```

```bash
pnpm --filter web build
cd web && ../api/node_modules/.bin/wrangler deploy
```

## 10. Test before inviting the club

Sign in with your admin email first.

- [ ] Website: sign in with Google. `/admin` opens, and a non-admin account can't open it.
- [ ] Android: install the APK, sign in, and save your handles. Approve them on the website under Admin → Students & handles.
- [ ] Android: wait for a real contest, or ask for a test one. You get the T−60 and T−5 pushes.
- [ ] Android: with the app killed, tap **Yes** on the T−5 push. Do it again on another contest with **No** and a typed reason. Both show in the admin grid.
- [ ] After the contest ends, attendance updates about 20 minutes later and the result push arrives. Check the **participation** run under GitHub Actions.
- [ ] CodeChef: do the same for one Starters. If the **participation** run fails with `Unknown CodeChef time format`, send me the message.
- [ ] Solve a problem on Codeforces. It shows on the leaderboard within about 30 minutes.
- [ ] iPhone: in Safari, Add to Home Screen, open it from there, go to Me, and turn on notifications. A contest push arrives.
- [ ] Run `pnpm --filter api exec wrangler tail` during a few cron runs and check for no `exceededCpu`.
- [ ] Android: install on a clean phone and check pushes still arrive after a reboot.
- [ ] Run one full contest cycle with 3 test students. Then invite the club.

To send everyone to the app, share your web URL followed by `/download`.

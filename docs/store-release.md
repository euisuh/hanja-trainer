# Store release

Decision [#292](https://github.com/euisuh/hanja-trainer/issues/292): the apps ship
only through **TestFlight internal testing** and the **Google Play internal
testing track**. The backend is one shared household, so a public listing needs
real accounts first (a separate epic).

## Before each release

1. Deploy the Worker first (`npm run deploy`, README "Deploy"). An installed app
   calls the production API.
2. If the release follows an API break, bump `API_COMPAT_VERSION` in
   `shared/api.ts` in that change, and raise `MIN_CLIENT_COMPAT_VERSION` in
   `worker/api/router.ts` only after testers have the new build.
3. Set the version once in every place that shows it:
   - `package.json` `version` (first release: `1.0.0`)
   - Android `android/app/build.gradle`: `versionName` = that version,
     `versionCode` = previous + 1 (Play rejects a reused code)
   - iOS: Xcode → App target → General → Version (`MARKETING_VERSION`) and Build
     (`CURRENT_PROJECT_VERSION`, previous + 1)
4. `npm run build:mobile`.

## Android (Play internal testing)

1. Create the upload keystore once, outside the repo (`*.jks` and `*.keystore`
   are gitignored). Keep it and its passwords in the password manager; losing it
   means a Play support request to reset the upload key.
   `keytool -genkeypair -v -keystore ~/keys/hanja-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
2. Android Studio → Build → Generate Signed App Bundle → the keystore above.
3. Play Console → the app → Testing → Internal testing → Create release → upload
   the `.aab`, add testers by email list.

## iOS (TestFlight internal)

1. Xcode → App target → Signing & Capabilities → Team = the Apple Developer
   account, automatic signing.
2. Product → Archive → Distribute App → App Store Connect → Upload.
3. App Store Connect → TestFlight → Internal Testing → add testers (they must be
   users on the App Store Connect team).

## Store forms

Privacy policy URL: `https://hanja.uiseoya.com/privacy` (source:
`public/privacy.html`; keep it in sync with what the code stores).

### App Store Connect: App Privacy

- Data used to track you: **none**. Third-party advertising or analytics: **none**.
- Data linked to the user (the profile), collected for **App Functionality** only:
  - *User Content → Other User Content*: learning history (answers, timings, session results)
  - *Identifiers → User ID*: profile id
  - *Other Data*: profile display name and learning settings
- Audio: recorded only on device for playback, never transmitted, so it is **not collected**.
- `ios/App/App/PrivacyInfo.xcprivacy` already declares the UserDefaults API (`CA92.1`) used by Preferences.

### Google Play: Data safety

- Data collected: *App activity → Other actions* (learning history) and
  *Personal info → Name* (display name); purpose **App functionality**; not
  shared with third parties; not optional (the app needs a profile).
- Encrypted in transit: **yes** (HTTPS only).
- Deletion: an admin deletes profiles in Settings; other deletion requests go to
  the household admin (see the privacy policy).
- Microphone: requested for speaking practice; audio stays on device.

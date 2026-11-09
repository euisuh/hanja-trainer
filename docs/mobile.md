# Mobile (Capacitor)

[Documentation index](README.md)


`android/` and `ios/` wrap the same SPA; see [mobile roadmap](mobile-roadmap.md). The app
talks to the deployed Worker at `https://hanja.uiseoya.com`, so native sign-in
needs a Worker that includes bearer tokens and Capacitor CORS.

Requirements: Node 22+, Xcode for iOS, Android Studio with JDK 21 for Android.

```sh
npm run ios       # builds with VITE_API_ORIGIN, syncs, opens Xcode
npm run android   # builds with VITE_API_ORIGIN, syncs, opens Android Studio
```

`npm run build:mobile` only builds and runs `cap sync`. Rerun it after every web
change; the native projects copy `dist/client` and do not watch it. Inspect the
WebView with Safari → Develop (iOS) or `chrome://inspect` (Android). Compile
check without signing:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -configuration Debug -packageAuthorizationProvider netrc CODE_SIGNING_ALLOWED=NO build
cd android && ./gradlew assembleDebug
```

From a non-interactive shell (agents, CI), keep `-packageAuthorizationProvider netrc`:
the default keychain lookup for github.com can wait forever on an invisible prompt
while Swift Package Manager downloads the Capacitor binary frameworks.

Native builds mirror pending and rejected reviews/session summaries to
Capacitor Preferences and restore missing localStorage entries before loading
the app. Existing local values win, and entries from older builds are backed
up at startup. Web builds keep localStorage only. The mirror is asynchronous:
an abrupt process kill before a write finishes, or a native storage failure,
can leave only the localStorage copy. This does not provide offline card
downloads or persist the sign-in token (tracked separately in #288).


Distribution steps: [store release](store-release.md). The roadmap records the
original plan; [architecture](architecture.md) describes the current implementation.

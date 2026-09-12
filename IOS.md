# Ghost Taxi for iOS

The native wrapper uses Capacitor 8 and targets iOS 15 or newer. The game is locked to landscape orientation.

## Run locally

```sh
npm install
npm run ios:sync
npm run ios:open
```

In Xcode, select the `App` scheme and an iPhone simulator or connected device, then press Run.

## After changing the web game

Run `npm run ios:sync` before building in Xcode. This rebuilds the static web bundle and copies it into the native app.

## TestFlight

The project uses automatic signing, version `1.0.0` (build `1`), bundle identifier `com.joeruocco.ghosttaxi`, and declares that it does not use non-exempt encryption.

This Mac currently has no valid Apple code-signing identity. In Xcode, open the `App` target, choose **Signing & Capabilities**, sign into an Apple Developer account, and select the correct team. After that:

```sh
npm run ios:archive
npm run ios:testflight
```

The first command creates the release archive. The second exports and uploads it to App Store Connect using the account configured in Xcode. Apple may still require the app record, privacy answers, screenshots, age rating, and store metadata before external TestFlight testing or App Store review.

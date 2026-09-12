# Ghost Taxi for iOS

The native wrapper uses Capacitor 8 and targets iOS 15 or newer. The game is locked to landscape orientation and requires full screen on iPad.

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

Automatic signing is configured with the Apple Developer team already used by this Mac's recent successful App Store archive. Create and verify the release archive with:

```sh
npm run ios:archive
```

Export and validate a local App Store-signed IPA without uploading:

```sh
npm run ios:export
```

To upload the archive to App Store Connect after reviewing it:

```sh
npm run ios:testflight
```

The archive command creates the signed release archive. The TestFlight command exports and uploads it to App Store Connect using the account configured in Xcode. Apple may still require the app record, privacy answers, screenshots, age rating, and store metadata before external TestFlight testing or App Store review.

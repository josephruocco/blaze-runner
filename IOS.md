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

## Before App Store submission

In Xcode, set the Apple Developer team, confirm the bundle identifier (`com.joeruocco.ghosttaxi`), replace the generated app icon and launch artwork, then create an archive for App Store Connect.

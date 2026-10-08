# Android release signing

`bct-release.jks` signs `BLOCK-CITY-TYCOON-Android-Release.apk`. Every release must be signed with the **same key**,
otherwise Android refuses to install the update over the existing app (and uninstalling would delete the cities).

- The key lives in this **private** repository so the GitHub release workflow can sign every APK identically.
- To use your own key (recommended before publishing on Google Play): create a keystore and set the CI secrets
  `BCT_KEYSTORE_FILE` (absolute path after decoding), `BCT_KEYSTORE_PASSWORD`, `BCT_KEY_ALIAS`, `BCT_KEY_PASSWORD` —
  environment variables always override `release.properties`. On Google Play, use Play App Signing.
- Never publish this folder if the repository is made public.

SHA-256 certificate fingerprint: `60:93:09:04:83:DF:98:46:98:57:16:B1:E2:0A:5B:B8:D2:4E:70:CF:1A:75:DD:E1:77:70:B7:30:67:70:DC:A9`

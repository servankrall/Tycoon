#!/bin/bash
# BLOCK CITY TYCOON — runs the automatic Android self-test on a connected device / emulator:
#   install the APK → start it in self-test mode (isolated sandbox, never touches real cities) → wait for the report in logcat
#   → write the JSON report, a screenshot and the logcat; exit 1 when a step failed.
# Usage: bash scripts/android-selftest.sh <apk> <report.json>
set -u
APK="${1:-dist/android/BLOCK-CITY-TYCOON-Android-Release.apk}"; OUT="${2:-dist/android/selftest-report-android.json}"
PKG=com.blockcitytycoon.game
DIR=$(dirname "$OUT"); mkdir -p "$DIR"
adb wait-for-device
for i in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break; sleep 3; done
adb shell settings put global window_animation_scale 0 >/dev/null 2>&1; adb shell settings put global transition_animation_scale 0 >/dev/null 2>&1
adb shell input keyevent 82 >/dev/null 2>&1
echo "Installing $APK"; adb install -r -g "$APK" || { echo "install failed"; exit 1; }
adb logcat -c
echo "Starting the self-test"
adb shell am start -W -n $PKG/.MainActivity --ez selftest true
done=0
for i in $(seq 1 240); do
  sleep 5
  if adb logcat -d -s BCT_SELFTEST:I | grep -q "SELFTEST_DONE"; then done=1; break; fi
  if [ $((i % 12)) -eq 0 ]; then echo "… $((i * 5)) s"; adb logcat -d -s BCT:I | grep "\[selftest\]" | tail -3; fi
done
adb exec-out screencap -p > "$DIR/android-screenshot.png" 2>/dev/null || true
adb logcat -d > "$DIR/logcat.txt" 2>/dev/null || true
if [ $done -ne 1 ]; then echo "The self-test did not finish within 20 minutes"; grep -E "BCT|chromium" "$DIR/logcat.txt" | tail -60; exit 1; fi
# reassemble the report from the logcat chunks "R<k>/<n> …"
grep "BCT_SELFTEST" "$DIR/logcat.txt" | sed -n 's/^.*BCT_SELFTEST: R\([0-9]*\)\/\([0-9]*\) \(.*\)$/\1\t\3/p' | sort -n -k1,1 | awk -F'\t' '!seen[$1]++ { printf "%s", substr($0, index($0, "\t") + 1) }' > "$OUT"
node -e "
const r = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
r.steps.forEach(s => console.log((s.ok ? 'PASS ' : 'FAIL ') + String(s.n).padStart(2) + '. ' + s.name + ' — ' + s.detail));
console.log('Android self-test: ' + r.passed + '/' + r.total + ' passed in ' + r.seconds + ' s (' + r.platform + ', v' + r.version + ')');
process.exit(r.ok ? 0 : 1);" "$OUT"

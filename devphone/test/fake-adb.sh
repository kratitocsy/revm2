#!/usr/bin/env bash
# Stand-in for adb in tests: records each call and returns canned output.
echo "$*" >> "${FAKE_ADB_LOG:-/dev/null}"
[ "$1" = "-s" ] && shift 2
case "$1 $2" in
  "exec-out screencap") base64 -d <<< 'iVBORw0KGgoAAAANSUhEUgAAACQAAABOCAIAAADHDSPzAAAAO0lEQVR4nO3NMQ0AAAgDsBnDIKbBBeFo0r+ZrjORyWQymUwmk8lkMplMJpPJZDKZTCaTyWQymUwm+5Itfud07sUzAewAAAAASUVORK5CYII=' ;;
  "exec-out uiautomator") cat <<'XML'
<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.wynko.app" content-desc="" clickable="false" enabled="true" bounds="[0,0][720,1560]"><node index="0" text="Start Focus" resource-id="com.wynko.app:id/start" class="android.widget.Button" package="com.wynko.app" content-desc="" clickable="true" enabled="true" bounds="[100,1000][620,1100]" /><node index="1" text="Email &amp; phone" resource-id="com.wynko.app:id/email" class="android.widget.EditText" package="com.wynko.app" content-desc="" clickable="true" enabled="true" bounds="[100,400][620,480]" /></node></hierarchy>UI hierchary dumped to: /dev/tty
XML
  ;;
  "get-state "*) echo device ;;
  "install -r") echo "Performing Streamed Install"; echo "Success" ;;
  "logcat -d") echo "11-18 10:00:00.000 E AndroidRuntime: FATAL EXCEPTION: main" ;;
  "shell "*) [[ "$2" == dumpsys* ]] && echo "  mResumedActivity: ActivityRecord{1 u0 com.wynko.app/.MainActivity t5}" ;;
  "connect "*) echo "connected to $2" ;;
esac
exit 0

#!/bin/sh
# Runs the Unity editor headless against the project in unity/.
#   tools/unity.sh test            EditMode tests; results in unity/Logs/editmode-results.xml
#   tools/unity.sh build           WebGL build via Buried.Editor.Build.WebGL
#   tools/unity.sh exec <Method>   any static editor method, e.g. Buried.Editor.Setup.Run
# The editor log goes to unity/Logs/<mode>.log; the last lines and any compile errors are printed.
# Set UNITY_BIN to override the editor path.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNITY_BIN="${UNITY_BIN:-/Volumes/Crucial X9/Unity/Editors/6000.3.26f1/Unity.app/Contents/MacOS/Unity}"
PROJECT="$ROOT/unity"
MODE="${1:-}"
[ -x "$UNITY_BIN" ] || { echo "Unity editor not found at $UNITY_BIN (is the drive mounted?)"; exit 3; }
[ -d "$PROJECT" ] || { echo "No Unity project at $PROJECT"; exit 3; }
mkdir -p "$PROJECT/Logs"
case "$MODE" in
  test)
    LOG="$PROJECT/Logs/editmode.log"
    "$UNITY_BIN" -batchmode -nographics -projectPath "$PROJECT" -runTests -testPlatform EditMode \
      -testResults "$PROJECT/Logs/editmode-results.xml" -logFile "$LOG" < /dev/null
    CODE=$? ;;
  build)
    LOG="$PROJECT/Logs/build.log"
    "$UNITY_BIN" -batchmode -nographics -quit -projectPath "$PROJECT" -buildTarget WebGL \
      -executeMethod Buried.Editor.Build.WebGL -logFile "$LOG" < /dev/null
    CODE=$? ;;
  exec)
    METHOD="${2:?usage: tools/unity.sh exec <Namespace.Class.Method>}"
    LOG="$PROJECT/Logs/exec.log"
    # Buried.Editor.Still.Render and WalkStill.Render draw pictures, so they need a graphics device; every other method runs headless.
    GRAPHICS="-nographics"
    [ "$METHOD" = "Buried.Editor.Still.Render" ] && GRAPHICS=""
    [ "$METHOD" = "Buried.Editor.WalkStill.Render" ] && GRAPHICS=""
    "$UNITY_BIN" -batchmode $GRAPHICS -quit -projectPath "$PROJECT" -executeMethod "$METHOD" \
      -logFile "$LOG" < /dev/null
    CODE=$? ;;
  *)
    echo "usage: tools/unity.sh test | build | exec <Method>"; exit 2 ;;
esac
echo "unity exit code: $CODE   log: $LOG"
grep -E "error CS[0-9]+|Scripts have compiler errors|Build Finished|BuildFailedException|Test run completed|Exception:" "$LOG" | sort -u | head -40
if [ "$MODE" = "test" ] && [ -f "$PROJECT/Logs/editmode-results.xml" ]; then
  grep -o '<test-run [^>]*>' "$PROJECT/Logs/editmode-results.xml" | head -1
  grep -o '<test-case [^>]*result="Failed"[^>]*>' "$PROJECT/Logs/editmode-results.xml" | head -20
fi
exit $CODE

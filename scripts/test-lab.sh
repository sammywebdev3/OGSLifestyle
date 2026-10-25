#!/usr/bin/env bash
# Character lab browser tests (see playwright.config.ts): the lab build first, then a normal build with the lab
# disabled. Both use .next, so they run one after the other; the normal build is left in .next at the end.
# Extra arguments go to the lab run (e.g. --project=lab-phone, or -g "sharing").
set -euo pipefail
cd "$(dirname "$0")/.."
LAB_TARGET=lab npx playwright test --project=lab-desktop --project=lab-phone "$@"
LAB_TARGET=flag-off npx playwright test

#!/usr/bin/env bash
set -euo pipefail
# The platform supervises this script in both Development and Production.
# Keep the app-backend guard name so Restart app can restart this process.
exec guard app-backend /workspace/fastapi-form-service/start.sh

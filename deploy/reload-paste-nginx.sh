#!/bin/sh
set -eu
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/paste.blocksmith.studio ]; then
    /usr/sbin/nginx -t
    /usr/bin/systemctl reload nginx
fi

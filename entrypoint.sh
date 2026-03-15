#!/bin/sh
mkdir -p /data
chown -R root:root /data
chmod -R 777 /data
exec node server.js

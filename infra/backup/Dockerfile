FROM postgres:16-alpine

RUN apk add --no-cache bash coreutils restic tzdata \
    && mkdir -p /var/lib/backup /backups

COPY infra/backup/backup.sh /usr/local/bin/backup.sh
COPY infra/backup/healthcheck.sh /usr/local/bin/backup-healthcheck.sh
COPY infra/backup/entrypoint.sh /usr/local/bin/backup-entrypoint.sh
COPY infra/backup/crontab /etc/crontabs/root
RUN chmod 0755 \
    /usr/local/bin/backup.sh \
    /usr/local/bin/backup-healthcheck.sh \
    /usr/local/bin/backup-entrypoint.sh \
    && chmod 0600 /etc/crontabs/root

ENTRYPOINT ["/usr/local/bin/backup-entrypoint.sh"]

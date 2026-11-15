#!/bin/bash
set -eu
export DEBIAN_FRONTEND=noninteractive
. /etc/tenantforge-bootstrap
cd /opt/tenantforge
mkdir -p /var/lib/tenantforge
CONFIG_FILE=/var/lib/tenantforge/config.json
umask 077
for attempt in $(seq 1 120); do
  if aws ssm get-parameter --name "$SSM_PARAMETER" --with-decryption --region "$AWS_REGION" --query Parameter.Value --output text > "$CONFIG_FILE" && python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get("CONFIG_READY") == "true" else 1)' "$CONFIG_FILE"; then break; fi
  sleep 5
done
python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get("CONFIG_READY") == "true" else 1)' "$CONFIG_FILE"
export ARTIFACT_KEY=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["ARTIFACT_KEY"])' "$CONFIG_FILE")
if [ ! -f .artifact-key ] || [ "$(cat .artifact-key)" != "$ARTIFACT_KEY" ]; then
  aws s3 cp "s3://$ARTIFACT_BUCKET/$ARTIFACT_KEY" /tmp/app.tar.gz --region "$AWS_REGION"
  tar -xzf /tmp/app.tar.gz -C /opt/tenantforge
  touch /var/lib/tenantforge/needs-build
fi
apt-get update -qq
apt-get install -y curl ca-certificates jq prometheus-node-exporter
id attendance >/dev/null 2>&1 || useradd --system --home /opt/tenantforge --shell /usr/sbin/nologin attendance
jq -r 'to_entries[] | "\(.key)=\(.value|@json)"' "$CONFIG_FILE" > /opt/tenantforge/service.env
chmod 600 /opt/tenantforge/service.env
umask 022
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if [ "$SERVICE_ROLE" = database ]; then
  if ! command -v pg_conftool >/dev/null || [ ! -d /etc/postgresql/17/main ]; then
    apt-get install -y postgresql-common
    install -d /usr/share/postgresql-common/pgdg
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
    echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main' > /etc/apt/sources.list.d/pgdg.list
    apt-get update -qq
    apt-get install -y postgresql-17
  fi
  apt-get install -y prometheus-postgres-exporter
  systemctl enable --now postgresql
  DB_PASSWORD=$(jq -r .DB_PASSWORD "$CONFIG_FILE")
  MONITOR_PASSWORD=$(jq -r .MONITOR_PASSWORD "$CONFIG_FILE")
  BACKEND_HOST=$(jq -r .BACKEND_HOST "$CONFIG_FILE")
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='attendance'" | grep -q 1 || sudo -u postgres createuser attendance
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER attendance WITH PASSWORD '$DB_PASSWORD';"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='attendance'" | grep -q 1 || sudo -u postgres createdb -O attendance attendance
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='attendance_monitor'" | grep -q 1 || sudo -u postgres createuser attendance_monitor
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER attendance_monitor WITH PASSWORD '$MONITOR_PASSWORD'; GRANT pg_monitor TO attendance_monitor;"
  pg_conftool 17 main set listen_addresses '*'
  cat > /etc/postgresql/17/main/pg_hba.conf <<HBA
local all postgres peer
local all all peer
host all all 127.0.0.1/32 scram-sha-256
host all all ::1/128 scram-sha-256
host attendance attendance $BACKEND_HOST/32 scram-sha-256
HBA
  printf 'DATA_SOURCE_NAME="postgresql://attendance_monitor:%s@127.0.0.1:5432/postgres?sslmode=disable"\nARGS="--web.listen-address=0.0.0.0:9187"\n' "$MONITOR_PASSWORD" > /etc/default/prometheus-postgres-exporter
  chmod 600 /etc/default/prometheus-postgres-exporter
  systemctl restart postgresql
  systemctl enable --now prometheus-postgres-exporter prometheus-node-exporter
  systemctl restart prometheus-postgres-exporter prometheus-node-exporter
else
  if ! command -v node >/dev/null; then
    apt-get install -y gnupg
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt-get install -y nodejs
  fi
  if [ "$SERVICE_ROLE" = backend ]; then
    apt-get install -y postgresql-client
    cp /opt/tenantforge/service.env backend/.env
    chmod 600 backend/.env
    if [ -f /var/lib/tenantforge/needs-build ] || [ ! -f backend/dist/main.js ]; then
      (cd backend && npm ci --no-audit --no-fund && npx prisma generate && npm run build)
    fi
    cat > /etc/systemd/system/attendance-backend.service <<'UNIT'
[Unit]
Description=Tenant attendance API on a dedicated backend instance
After=network.target
[Service]
User=attendance
WorkingDirectory=/opt/tenantforge/backend
ExecStart=/usr/bin/node --env-file=.env dist/main.js
Restart=always
RestartSec=5
MemoryMax=768M
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
UNIT
    chown -R attendance:attendance /opt/tenantforge/backend
    systemctl daemon-reload
    systemctl enable attendance-backend
    MIGRATION_MODE=$(jq -r '.MIGRATION_MODE // "false"' "$CONFIG_FILE")
    if [ "$MIGRATION_MODE" = true ]; then
      systemctl stop attendance-backend || true
    else
      DB_HOST=$(jq -r .DATABASE_HOST "$CONFIG_FILE")
      DB_PASSWORD=$(jq -r .DB_PASSWORD "$CONFIG_FILE")
      DATABASE_READY=false
      for attempt in $(seq 1 120); do
        if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U attendance -d attendance -tAc 'SELECT 1' >/dev/null 2>&1; then DATABASE_READY=true; break; fi
        sleep 5
      done
      [ "$DATABASE_READY" = true ]
      (cd backend && npx prisma migrate deploy)
      systemctl restart attendance-backend
    fi
  else
    apt-get install -y nginx prometheus prometheus-blackbox-exporter gnupg
    if ! command -v grafana >/dev/null; then
      mkdir -p /etc/apt/keyrings
      curl -fsSL https://apt.grafana.com/gpg-full.key -o /etc/apt/keyrings/grafana.asc
      echo 'deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main' > /etc/apt/sources.list.d/grafana.list
      apt-get update -qq
      apt-get install -y grafana
    fi
    BACKEND_HOST=$(jq -r .BACKEND_HOST "$CONFIG_FILE")
    DATABASE_HOST=$(jq -r .DATABASE_HOST "$CONFIG_FILE")
    TENANT_ID=$(jq -r .TENANT_ID "$CONFIG_FILE")
    TENANT_ENVIRONMENT=$(jq -r .TENANT_ENVIRONMENT "$CONFIG_FILE")
    TENANT_NAME=$(jq -r .TENANT_NAME "$CONFIG_FILE")
    TENANT_COLOR=$(jq -r .TENANT_COLOR "$CONFIG_FILE")
    if [ -f /var/lib/tenantforge/needs-build ] || [ ! -f frontend/.next/BUILD_ID ]; then
      (cd frontend && npm ci --no-audit --no-fund && NEXT_PUBLIC_PLATFORM_ENABLED=false NEXT_PUBLIC_TENANT_NAME="$TENANT_NAME" NEXT_PUBLIC_TENANT_COLOR="$TENANT_COLOR" NEXT_PUBLIC_API_URL=/api API_INTERNAL_URL="http://$BACKEND_HOST:3001/api" npm run build)
    fi
    cat > /etc/systemd/system/attendance-frontend.service <<'UNIT'
[Unit]
Description=Tenant attendance UI on a dedicated frontend instance
After=network.target
[Service]
User=attendance
WorkingDirectory=/opt/tenantforge/frontend
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
MemoryMax=768M
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
UNIT
    cat > /etc/nginx/sites-available/default <<NGINX
server {
  listen 80 default_server;
  server_name _;
  client_max_body_size 5M;
  location /api/ {
    proxy_pass http://$BACKEND_HOST:3001;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  }
  location /monitoring/ { proxy_pass http://127.0.0.1:9090/; }
  location /grafana/ {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host \$http_host;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_http_version 1.1;
  }
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host \$host;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
NGINX
    cat > /etc/prometheus/prometheus.yml <<PROM
global:
  scrape_interval: 10s
  evaluation_interval: 10s
rule_files:
  - /etc/prometheus/tenant-alerts.yml
scrape_configs:
  - job_name: attendance
    metrics_path: /api/metrics
    static_configs:
      - targets: ['$BACKEND_HOST:3001']
        labels: {tenant: '$TENANT_ID', environment: '$TENANT_ENVIRONMENT', role: backend}
  - job_name: node
    static_configs:
      - targets: ['127.0.0.1:9100']
        labels: {tenant: '$TENANT_ID', environment: '$TENANT_ENVIRONMENT', role: frontend}
      - targets: ['$BACKEND_HOST:9100']
        labels: {tenant: '$TENANT_ID', environment: '$TENANT_ENVIRONMENT', role: backend}
      - targets: ['$DATABASE_HOST:9100']
        labels: {tenant: '$TENANT_ID', environment: '$TENANT_ENVIRONMENT', role: database}
  - job_name: postgres
    static_configs:
      - targets: ['$DATABASE_HOST:9187']
        labels: {tenant: '$TENANT_ID', environment: '$TENANT_ENVIRONMENT', role: database}
  - job_name: http
    metrics_path: /probe
    params: {module: [http_2xx]}
    static_configs:
      - targets: ['http://127.0.0.1/']
        labels: {tenant: '$TENANT_ID', environment: '$TENANT_ENVIRONMENT', role: frontend}
      - targets: ['http://$BACKEND_HOST:3001/api/health']
        labels: {tenant: '$TENANT_ID', environment: '$TENANT_ENVIRONMENT', role: backend}
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: 127.0.0.1:9115
PROM
    cp infrastructure/monitoring/alerts.yml /etc/prometheus/tenant-alerts.yml
    mkdir -p /etc/grafana/provisioning/datasources /etc/grafana/provisioning/dashboards /var/lib/grafana/dashboards
    cp infrastructure/monitoring/datasource.yml /etc/grafana/provisioning/datasources/attendance.yml
    cp infrastructure/monitoring/dashboards.yml /etc/grafana/provisioning/dashboards/attendance.yml
    cp infrastructure/monitoring/dashboard.json /var/lib/grafana/dashboards/attendance.json
    cat > /etc/grafana/grafana.ini <<'GRAFANA'
[server]
http_addr = 127.0.0.1
http_port = 3100
root_url = http://localhost/grafana/
serve_from_sub_path = true
[security]
admin_user = admin
admin_password = $__env{GRAFANA_ADMIN_PASSWORD}
[users]
allow_sign_up = false
GRAFANA
    mkdir -p /etc/systemd/system/grafana-server.service.d
    cat > /etc/systemd/system/grafana-server.service.d/tenant.conf <<'UNIT'
[Service]
EnvironmentFile=/opt/tenantforge/service.env
UNIT
    chown -R attendance:attendance /opt/tenantforge/frontend
    systemctl disable --now attendance-backend postgresql 2>/dev/null || true
    rm -f /opt/tenantforge/backend/.env
    systemctl daemon-reload
    systemctl enable attendance-frontend nginx prometheus prometheus-blackbox-exporter grafana-server
    systemctl restart attendance-frontend nginx prometheus prometheus-blackbox-exporter grafana-server
  fi
fi

systemctl enable --now prometheus-node-exporter
systemctl restart prometheus-node-exporter
printf '%s' "$ARTIFACT_KEY" > .artifact-key
printf '%s' "$SERVICE_ROLE" > /var/lib/tenantforge/role-ready
rm -f /var/lib/tenantforge/needs-build "$CONFIG_FILE"
echo "Role $SERVICE_ROLE configured."

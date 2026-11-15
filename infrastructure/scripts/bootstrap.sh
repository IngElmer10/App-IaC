#!/bin/bash
set -eu
export DEBIAN_FRONTEND=noninteractive
. /etc/tenantforge-bootstrap
cd /opt/tenantforge
aws ssm get-parameter --name "$SSM_PARAMETER" --with-decryption --region "$AWS_REGION" --query Parameter.Value --output text > /tmp/tenant-environment.json
chmod 600 /tmp/tenant-environment.json
export ARTIFACT_KEY=$(python3 -c 'import json; print(json.load(open("/tmp/tenant-environment.json"))["ARTIFACT_KEY"])')
if [ ! -f .artifact-key ] || [ "$(cat .artifact-key)" != "$ARTIFACT_KEY" ]; then
  aws s3 cp "s3://$ARTIFACT_BUCKET/$ARTIFACT_KEY" /tmp/app.tar.gz --region "$AWS_REGION"
  tar -xzf /tmp/app.tar.gz -C /opt/tenantforge
  touch /tmp/tenant-needs-build
fi
if ! command -v node >/dev/null || ! command -v psql >/dev/null || ! command -v grafana >/dev/null; then
  apt-get update -qq
  apt-get install -y curl ca-certificates gnupg nginx jq prometheus prometheus-node-exporter postgresql-common
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main' > /etc/apt/sources.list.d/pgdg.list
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://apt.grafana.com/gpg-full.key -o /etc/apt/keyrings/grafana.asc
  echo 'deb [signed-by=/etc/apt/keyrings/grafana.asc] https://apt.grafana.com stable main' > /etc/apt/sources.list.d/grafana.list
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get update -qq
  apt-get install -y nodejs postgresql-17 grafana
fi
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
id attendance >/dev/null 2>&1 || useradd --system --home /opt/tenantforge --shell /usr/sbin/nologin attendance
systemctl enable --now postgresql
DB_PASSWORD=$(jq -r .DB_PASSWORD /tmp/tenant-environment.json)
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='attendance'" | grep -q 1 || sudo -u postgres createuser attendance
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER attendance WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='attendance'" | grep -q 1 || sudo -u postgres createdb -O attendance attendance
jq -r 'to_entries[] | "\(.key)=\(.value|@json)"' /tmp/tenant-environment.json > backend/.env
chmod 600 backend/.env
rm -f /tmp/tenant-environment.json
if [ -f /tmp/tenant-needs-build ]; then
  (cd backend && npm ci --no-audit --no-fund && npx prisma generate && npm run build)
  TENANT_NAME=$(node --env-file=backend/.env -e 'process.stdout.write(process.env.TENANT_NAME || process.env.TENANT_SLUG || "")')
  (cd frontend && npm ci --no-audit --no-fund && NEXT_PUBLIC_PLATFORM_ENABLED=false NEXT_PUBLIC_TENANT_NAME="$TENANT_NAME" NEXT_PUBLIC_API_URL=/api API_INTERNAL_URL=http://127.0.0.1:3001/api npm run build)
  printf '%s' "$ARTIFACT_KEY" > .artifact-key
  rm -f /tmp/tenant-needs-build
fi
(cd backend && npx prisma migrate deploy)
chown -R attendance:attendance /opt/tenantforge
cat > /etc/systemd/system/attendance-backend.service <<'UNIT'
[Unit]
Description=Tenant attendance API
After=network.target postgresql.service
[Service]
User=attendance
WorkingDirectory=/opt/tenantforge/backend
ExecStart=/usr/bin/node --env-file=.env dist/main.js
Restart=always
RestartSec=5
MemoryMax=512M
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/attendance-frontend.service <<'UNIT'
[Unit]
Description=Tenant attendance frontend
After=network.target attendance-backend.service
[Service]
User=attendance
WorkingDirectory=/opt/tenantforge/frontend
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
MemoryMax=512M
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/nginx/sites-available/default <<'NGINX'
server {
  listen 80 default_server;
  server_name _;
  client_max_body_size 5M;
  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
  location /monitoring/ {
    proxy_pass http://127.0.0.1:9090/;
  }
  location /grafana/ {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $http_host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_http_version 1.1;
  }
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
NGINX
TENANT_ID=$(sed -n 's/^TENANT_ID="\(.*\)"$/\1/p' backend/.env)
TENANT_ENVIRONMENT=$(sed -n 's/^TENANT_ENVIRONMENT="\(.*\)"$/\1/p' backend/.env)
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
      - targets: ['127.0.0.1:3001']
        labels: {tenant: '$TENANT_ID', environment: '$TENANT_ENVIRONMENT'}
  - job_name: node
    static_configs:
      - targets: ['127.0.0.1:9100']
        labels: {tenant: '$TENANT_ID', environment: '$TENANT_ENVIRONMENT'}
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
admin_password = $__env{DEFAULT_ADMIN_PASSWORD}
[users]
allow_sign_up = false
GRAFANA
mkdir -p /etc/systemd/system/grafana-server.service.d
cat > /etc/systemd/system/grafana-server.service.d/tenant.conf <<'UNIT'
[Service]
EnvironmentFile=/opt/tenantforge/backend/.env
UNIT
systemctl daemon-reload
systemctl enable attendance-backend attendance-frontend prometheus prometheus-node-exporter grafana-server nginx
systemctl restart attendance-backend attendance-frontend prometheus prometheus-node-exporter grafana-server nginx
echo 'Tenant services installed.'

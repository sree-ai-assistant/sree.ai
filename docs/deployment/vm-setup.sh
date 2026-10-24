#!/bin/bash
# ==============================================================================
# Sree AI - Oracle Cloud VM Initial Provisioning Script (Ubuntu 24.04 LTS)
# Run with: bash vm-setup.sh
# ==============================================================================

set -e

echo "=== [1/6] Updating Ubuntu packages ==="
sudo apt update && sudo apt upgrade -y

echo "=== [2/6] Installing Node.js 22 LTS, Nginx, Certbot, and Rsync ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx rsync iptables-persistent netfilter-persistent

echo "=== [3/6] Opening Host Firewall Ports 80 & 443 in iptables ==="
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || true
sudo netfilter-persistent save

echo "=== [4/6] Installing and Configuring PM2 ==="
sudo npm install -g pm2
pm2 startup systemd -u ubuntu --hp /home/ubuntu || true

echo "=== [5/6] Creating Application Directories (/var/www/sree-ai) ==="
sudo mkdir -p /var/www/sree-ai/app
sudo mkdir -p /var/www/sree-ai/logs
sudo chown -R ubuntu:www-data /var/www/sree-ai
sudo chmod -R 775 /var/www/sree-ai

if [ ! -f /var/www/sree-ai/.env ]; then
    touch /var/www/sree-ai/.env
    chmod 600 /var/www/sree-ai/.env
    echo "Created empty /var/www/sree-ai/.env (Fill this with your backend secrets!)"
fi

echo "=== [6/6] Installation Complete! ==="
node -v
npm -v
pm2 -v
nginx -v
echo "Next step: copy docs/deployment/nginx-sree-ai.conf to /etc/nginx/sites-available/sree-ai and populate /var/www/sree-ai/.env"

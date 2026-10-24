module.exports = {
  apps: [
    {
      name: 'sree-backend',
      script: 'dist/index.js',
      cwd: '/var/www/sree-ai/app/backend',
      instances: 1, // Single instance to match 1 OCPU on OCI Micro shape
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M', // Auto-restart if memory exceeds 500MB (protecting 1GB RAM VM)
      node_args: '--max-old-space-size=450',
      env_file: '/var/www/sree-ai/.env',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: '/var/www/sree-ai/logs/err.log',
      out_file: '/var/www/sree-ai/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      kill_timeout: 5000
    }
  ]
};

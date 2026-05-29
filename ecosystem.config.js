/**
 * ecosystem.config.js — S3-6: PM2 process manager config (risk H6 mitigation)
 *
 * Usage (alternative to docker-compose for bare-metal deploy):
 *   pm2 start ecosystem.config.js               # start backend
 *   pm2 status                                  # check status
 *   pm2 logs ibshi-backend                      # tail logs
 *   pm2 reload ibshi-backend --update-env       # graceful restart
 *   pm2 save && pm2 startup                     # auto-start on boot
 *
 * Auto-restart: PM2 will respawn on crash + on system reboot (after pm2 startup).
 */
module.exports = {
  apps: [
    {
      name: 'ibshi-backend',
      script: 'src/app.js',
      cwd: './backend',
      instances: 1, // single instance — embedded session state in app
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 5005,
        LOG_PRETTY: '1',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5005,
        LOG_LEVEL: 'info',
        LOG_FILE: '/var/log/ibshi/backend.log',
      },
      out_file: '/tmp/vattu-pm2-out.log',
      error_file: '/tmp/vattu-pm2-err.log',
      merge_logs: true,
      time: true,
      kill_timeout: 5000, // 5s graceful shutdown
      wait_ready: false,
      listen_timeout: 10000,
    },
  ],
};

module.exports = {
  apps: [{
    name: 'amocrm-health-monitor',
    script: './server/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }],

  deploy: {
    production: {
      user: 'root',
      host: 'amohealth.duckdns.org',
      ref: 'origin/main',
      repo: 'git@github.com:username/amocrm-health-monitor.git',
      path: '/root/Health Check amoCRM',
      'post-deploy': 'npm install && cd client && npm install && npm run build && cd .. && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': ''
    }
  }
};


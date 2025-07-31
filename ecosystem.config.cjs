module.exports = {
  apps: [
    {
      name: 'rana',
      script: '.output/server/index.mjs',
      cwd: process.cwd(),
      instances: 1,
      
      env: {
        NODE_ENV: 'production',
        DATABASE_CLIENT: 'client',
        DATABASE_URL: 'file:prod.db',
      },

      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      restart_delay: 2000,
      max_restarts: 5,
      watch: false,
    },
  ],
}

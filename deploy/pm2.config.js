module.exports = {
  apps: [
    {
      name: 'BigEyeMix-API',
      cwd: '/www/wwwroot/bem.it.sc.cn/api',
      script: '/www/wwwroot/bem.it.sc.cn/venv/bin/python',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8000',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

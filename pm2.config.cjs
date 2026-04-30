// PM2 process configuration for whatsapp-org-agent.
// Each org runs as a separate, isolated fork process.
// Add one entry per org; never share a process between orgs.
module.exports = {
  apps: [
    {
      name: 'paysys-agent',
      script: 'dist/main.js',
      env: { ORG: 'paysys' },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      out_file: 'orgs/paysys/runtime/logs/out.log',
      error_file: 'orgs/paysys/runtime/logs/err.log',
      time: true,
    },
    // add one entry per additional org here
  ],
};

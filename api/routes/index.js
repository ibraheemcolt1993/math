const { ok } = require('../_shared/http');

const ROUTES = {
  official: [
    { methods: ['POST'], path: '/api/auth/login', description: 'Admin login.' },
    { methods: ['PUT'], path: '/api/auth/password', description: 'Admin password update.' },
    { methods: ['GET', 'PUT'], path: '/api/admin/students', description: 'Admin students management.' },
    { methods: ['GET', 'PUT'], path: '/api/cards-mng', description: 'Admin cards management.' },
    { methods: ['GET'], path: '/api/cards', description: 'Public cards list.' },
    { methods: ['GET'], path: '/api/health', description: 'Health check.' },
    { methods: ['POST'], path: '/api/progress/complete', description: 'Record student completion.' },
    { methods: ['GET'], path: '/api/progress/completed', description: 'Fetch completed progress.' },
    { methods: ['POST'], path: '/api/students/login', description: 'Student login.' },
    { methods: ['GET', 'PUT'], path: '/api/weeks/{week:int}', description: 'Week details.' },
    { methods: ['GET'], path: '/api/weeks', description: 'Weeks list.' },
    { methods: ['GET'], path: '/api/routes', description: 'Route catalog.' }
  ],
  aliases: [
    { methods: ['POST'], path: '/api/admin/login', target: '/api/auth/login' },
    { methods: ['PUT'], path: '/api/admin/password', target: '/api/auth/password' },
    { methods: ['GET', 'PUT'], path: '/api/astu', target: '/api/admin/students' }
  ]
};

module.exports = async function (context) {
  context.res = ok({ ok: true, routes: ROUTES });
};

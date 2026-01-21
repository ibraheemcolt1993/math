const { ok } = require('../_shared/http');

const ROUTES = {
  official: [
    { methods: ['GET'], path: '/api/health', description: 'Health check.' },
    { methods: ['POST'], path: '/api/progress/complete', description: 'Record student completion.' },
    { methods: ['GET'], path: '/api/progress/completed', description: 'Fetch completed progress.' },
    { methods: ['POST'], path: '/api/students/login', description: 'Student login.' },
    { methods: ['GET'], path: '/api/mng/students', description: 'List students for management.' },
    { methods: ['POST'], path: '/api/mng/students', description: 'Create student (management).' },
    { methods: ['PUT'], path: '/api/mng/students/{studentId}', description: 'Update student (management).' },
    { methods: ['DELETE'], path: '/api/mng/students/{studentId}', description: 'Delete student (management).' },
    { methods: ['GET'], path: '/api/mng/cards', description: 'List cards for management.' },
    { methods: ['POST'], path: '/api/mng/cards', description: 'Create card (management).' },
    { methods: ['PUT'], path: '/api/mng/cards/{week}', description: 'Update card (management).' },
    { methods: ['DELETE'], path: '/api/mng/cards/{week}', description: 'Delete card (management).' },
    { methods: ['GET'], path: '/api/weeks/{week:int}', description: 'Week details.' },
    { methods: ['GET'], path: '/api/weeks', description: 'Weeks list.' },
    { methods: ['GET'], path: '/api/routes', description: 'Route catalog.' }
  ],
  aliases: []
};

module.exports = async function (context) {
  context.res = ok({ ok: true, routes: ROUTES });
};

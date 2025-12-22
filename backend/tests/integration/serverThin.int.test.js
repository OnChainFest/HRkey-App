/**
 * Server thin guard for HRScore routes.
 *
 * Ensures server.js does not grow new inline business logic for HRScore routes.
 */

import fs from 'fs';
import path from 'path';

describe('Server thin guard', () => {
  test('HRScore routes should not add new inline handlers in server.js', () => {
    const serverPath = path.resolve(process.cwd(), 'server.js');
    const serverContents = fs.readFileSync(serverPath, 'utf-8');

    const inlineHandlerRegex = /app\.(get|post|put|delete)\(\s*['"]([^'"]+)['"][^;]*?(async\s*)?\(\s*req\s*,\s*res\s*\)/g;
    const inlineHandlers = [];
    let match;

    while ((match = inlineHandlerRegex.exec(serverContents)) !== null) {
      const routePath = match[2];
      if (routePath.startsWith('/api/hrkey-score') || routePath.startsWith('/api/hrscore')) {
        inlineHandlers.push(routePath);
      }
    }

    const legacyInlineRoutes = new Set([
      '/api/hrkey-score',
      '/api/hrkey-score/model-info',
      '/api/hrkey-score/history',
      '/api/hrkey-score/export'
    ]);

    const unexpectedInlineRoutes = inlineHandlers.filter((routePath) => {
      if (routePath.startsWith('/api/hrscore')) {
        return true;
      }
      return !legacyInlineRoutes.has(routePath);
    });

    expect(unexpectedInlineRoutes).toEqual([]);
  });
});

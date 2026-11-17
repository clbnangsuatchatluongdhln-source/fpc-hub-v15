import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import vm from 'node:vm';

for (const name of ['probe-profiles.mjs', 'verify-messages.mjs', 'verify-p0-conv-states.mjs']) {
  const source = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
  // Replace only the SDK import. Stop at client creation so no operational code runs.
  const executable = source.replace(/^import \{ createClient \} from '@supabase\/supabase-js';\r?\n/, '');

  test(`${name}: no privileged JWT literal remains`, () => {
    for (const token of source.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
      assert.notEqual(payload.role, 'service_role', 'privileged JWT literal found');
    }
  });

  for (const key of [undefined, '', ' ', '\t\n']) {
    test(`${name}: missing/blank key fails before client creation (${JSON.stringify(key)})`, () => {
      let called = false;
      assert.throws(() => vm.runInNewContext(executable, {
        process: { env: key === undefined ? {} : { SUPABASE_SERVICE_ROLE_KEY: key } },
        createClient() { called = true; throw new Error('unexpected client creation'); },
      }), /SUPABASE_SERVICE_ROLE_KEY is required/);
      assert.equal(called, false);
    });
  }

  test(`${name}: injected key preserves client URL and session options`, () => {
    const stop = new Error('stop before operations');
    let captured;
    assert.throws(() => vm.runInNewContext(executable, {
      process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'offline-test-credential' } },
      createClient(...args) { captured = args; throw stop; },
    }), error => error === stop);
    assert.equal(captured[0], 'https://auqxbigkttrktwsfrdba.supabase.co');
    assert.equal(captured[1], 'offline-test-credential');
    assert.deepEqual(JSON.parse(JSON.stringify(captured[2])), { auth: { persistSession: false } });
  });
}

// Loaded before every test file, never by the application. Supplies a
// deterministic JWT configuration so tests can mint real tokens without secrets
// from the machine, and silences console noise unless TEST_LOG is set.

process.env.JWT_SECRET ??= "s5-test-secret-not-a-real-key"
process.env.JWT_EXPIRES_IN ??= "1h"

if (!process.env.TEST_LOG) {
  const noop = () => {}

  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  }

  console.log = noop
  console.warn = noop
  console.error = noop

  process.once("exit", () => {
    console.log = originalConsole.log
    console.warn = originalConsole.warn
    console.error = originalConsole.error
  })
}
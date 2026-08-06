// Loaded before every test file via the `test` npm script.
//
// Test-only environment setup.
//
// Responsibilities:
// 1. Provide a deterministic JWT configuration so authentication and
//    stream-ticket tests can generate real tokens without requiring secrets
//    from the developer's machine or CI environment.
// 2. Suppress console noise during successful test runs. Set TEST_LOG=1 to
//    preserve normal logging while debugging.
//
// This file is never loaded by the application itself.

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

  // Restore the original console methods when the process exits.
  process.once("exit", () => {
    console.log = originalConsole.log
    console.warn = originalConsole.warn
    console.error = originalConsole.error
  })
}
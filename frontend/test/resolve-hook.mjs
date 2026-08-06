// Lets Node's test runner import the app's modules unchanged.
//
// Vite resolves extensionless relative imports ("./constants"); plain Node ESM
// does not. Rather than adding a bundler-aware test runner as a dependency, or
// editing every import in src/ to suit the tests, this hook appends the
// extension Vite would have. It is the whole of the frontend test tooling.
//
// Only relative specifiers are touched; bare package specifiers fall through to
// Node's normal resolution.

import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const EXTENSIONS = [".js", ".jsx"]

export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    for (const extension of EXTENSIONS) {
      const candidate = new URL(specifier + extension, context.parentURL)
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, format: "module", shortCircuit: true }
      }
    }
  }
  return next(specifier, context)
}

// `import "server-only"` guards real server modules from browser bundles.
// Vitest runs them in Node on purpose, so the test configs alias the package to this empty stub.
export {};

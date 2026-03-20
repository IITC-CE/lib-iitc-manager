export default function () {
  process.env.NODE_ENV = 'test';
  return {
    files: ['package.json', 'test/storage.ts', 'src/**/*.ts'],

    tests: ['test/**/*spec.ts'],

    env: {
      type: 'node',
    },

    runAllTestsInAffectedTestFile: true,
    workers: { restart: true },
  };
}

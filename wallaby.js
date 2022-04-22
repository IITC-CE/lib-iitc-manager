export default function () {
    process.env.NODE_ENV = 'test';
    return {
        files: [
            'package.json',
            'test/storage.js',
            'src/**/*.js'
        ],

        tests: [
            'test/**/*spec.js',
        ],

        env: {
            type: 'node'
        },

        runAllTestsInAffectedTestFile: true,
        workers: { restart: true }
    };
};

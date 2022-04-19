export default function () {
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

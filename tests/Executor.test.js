(function () {
    'use strict';
    const Executor = require('../src/Executor');

    test('Executor.parallel.number', () => {
        var sequence = [], start = new Date().getTime(), passed = [], failed = [];
        for (var i = 0; i < 20; i++) {
            sequence.push(function (i_success, i_error) {
                setTimeout(function () {
                    passed.push(new Date().getTime() - start);
                }, 50);
            });
        }
        sequence.parallel = 5;
        Executor.run(sequence, function (i_results) {
            for (var i = 0; i < 20; i++) {
                var act = i_results[i], nom = (Math.floor(i / 5) + 1) * 50, err = nom - act;
                if (Math.abs(err) > 20) {
                    failed.push('array with 20 functions parallel = 5: ' + err + 'ms, idx: ' + i + ', durations: ' + JSON.stringify(i_results));
                    return;
                }
            }
            expect(passed.length).toBe(20);
        }, function (exc) {
            failed.push('array with 20 functions parallel = 5: ' + exc);
        });
    });

}());
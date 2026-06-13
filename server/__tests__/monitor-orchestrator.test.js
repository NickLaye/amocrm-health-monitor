/**
 * Unit tests for MonitorOrchestrator lifecycle.
 * Focus: monitors are started exactly once, and clients added at runtime
 * (e.g. via POST /api/accounts) are actually started — not left inert until
 * the next process restart.
 */

jest.mock('../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    })
}));

jest.mock('../config/client-registry', () => ({
    getClientIds: jest.fn(() => []),
    getClient: jest.fn()
}));

jest.mock('../token-manager', () => jest.fn().mockImplementation(() => ({})));

jest.mock('../monitor/index', () => ({
    AmoCRMMonitor: jest.fn().mockImplementation(function (config) {
        this.clientId = config.id;
        this.start = jest.fn();
        this.stop = jest.fn();
        this.addListener = jest.fn();
    })
}));

/**
 * Load a fresh orchestrator singleton with mocks reset.
 * @param {string[]} clientIds
 */
function load(clientIds) {
    jest.resetModules();
    const clientRegistry = require('../config/client-registry');
    clientRegistry.getClientIds.mockReturnValue(clientIds);
    clientRegistry.getClient.mockImplementation((id) => ({ id, amo: {}, tokens: {} }));
    const { AmoCRMMonitor } = require('../monitor/index');
    const orchestrator = require('../monitor-orchestrator');
    return { orchestrator, AmoCRMMonitor, clientRegistry };
}

describe('MonitorOrchestrator', () => {
    describe('start', () => {
        test('starts a monitor for each configured client exactly once', () => {
            const { orchestrator, AmoCRMMonitor } = load(['c1', 'c2']);

            orchestrator.start();

            expect(AmoCRMMonitor).toHaveBeenCalledTimes(2);
            const instances = AmoCRMMonitor.mock.instances;
            expect(instances[0].start).toHaveBeenCalledTimes(1);
            expect(instances[1].start).toHaveBeenCalledTimes(1);

            // Calling start() again must not double-start running monitors.
            orchestrator.start();
            expect(AmoCRMMonitor).toHaveBeenCalledTimes(2);
            expect(instances[0].start).toHaveBeenCalledTimes(1);
            expect(instances[1].start).toHaveBeenCalledTimes(1);
        });
    });

    describe('startClient', () => {
        test('creates and starts a client added at runtime', () => {
            const { orchestrator, AmoCRMMonitor } = load(['c1']);
            orchestrator.start();
            expect(AmoCRMMonitor).toHaveBeenCalledTimes(1);

            // c3 was registered after boot — must be started immediately.
            const monitor = orchestrator.startClient('c3');

            expect(monitor).toBeTruthy();
            expect(monitor.clientId).toBe('c3');
            expect(AmoCRMMonitor).toHaveBeenCalledTimes(2);
            const c3Instance = AmoCRMMonitor.mock.instances[1];
            expect(c3Instance.start).toHaveBeenCalledTimes(1);
        });

        test('is idempotent — does not restart an already-running client', () => {
            const { orchestrator, AmoCRMMonitor } = load(['c1']);
            orchestrator.start();

            orchestrator.startClient('c1'); // already started at boot
            const c1Instance = AmoCRMMonitor.mock.instances[0];
            expect(c1Instance.start).toHaveBeenCalledTimes(1);

            orchestrator.startClient('c3');
            orchestrator.startClient('c3'); // second call is a no-op
            const c3Instance = AmoCRMMonitor.mock.instances[1];
            expect(c3Instance.start).toHaveBeenCalledTimes(1);
            expect(AmoCRMMonitor).toHaveBeenCalledTimes(2);
        });
    });
});

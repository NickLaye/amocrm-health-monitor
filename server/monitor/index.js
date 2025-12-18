/**
 * Monitor Modules Index
 * Re-exports all monitor sub-modules for convenient importing
 */

const DPHandler = require('./dp-handler');
const HealthChecks = require('./health-checks');
const StatusManager = require('./status-manager');

/**
 * Apply mixin methods to a class prototype
 * @param {Function} targetClass - Target class to mix into
 * @param {Function} mixinClass - Mixin class to apply
 */
function applyMixin(targetClass, mixinClass) {
    Object.getOwnPropertyNames(mixinClass.prototype).forEach(name => {
        if (name !== 'constructor') {
            Object.defineProperty(
                targetClass.prototype,
                name,
                Object.getOwnPropertyDescriptor(mixinClass.prototype, name) ||
                Object.create(null)
            );
        }
    });
}

/**
 * Apply all monitor mixins to a class
 * @param {Function} targetClass - Target class (e.g., AmoCRMMonitor)
 */
function applyAllMixins(targetClass) {
    applyMixin(targetClass, DPHandler);
    applyMixin(targetClass, HealthChecks);
    applyMixin(targetClass, StatusManager);
}

const AmoCRMMonitor = require('./amo-crm-monitor');

// Create default instance for backward compatibility
const defaultMonitor = new AmoCRMMonitor();

module.exports = {
    DPHandler,
    HealthChecks,
    StatusManager,
    applyMixin,
    applyAllMixins,
    AmoCRMMonitor,
    // Export default instance properties to mimic old export style
    // But better to export the instance as default if tests require it
};

// Assign default export to match expected require behavior in tests: require('../monitor') -> instance
module.exports = defaultMonitor;
module.exports.AmoCRMMonitor = AmoCRMMonitor;
module.exports.DPHandler = DPHandler;
module.exports.HealthChecks = HealthChecks;
module.exports.StatusManager = StatusManager;
module.exports.applyMixin = applyMixin;
module.exports.applyAllMixins = applyAllMixins;

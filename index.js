'use strict';

const {
  registerClientExtension,
  registerClientPlugin
} = require('camunda-modeler-plugin-helpers');

// register components so they can be easily bootstrapped
registerClientExtension(require('./client'));

// we can even offer a menu provider
// to hook into the existing application menu
const MenuProvider = require('./menu');

/**
 * A client plugin that provides an advanced token simulation.
 */
function SimulationAnalysisPlugin(options) {

  registerClientPlugin(this, options);

  this.getMenu = function() {
    return MenuProvider(options.electronApp, options.menuState);
  };

  this.triggerAction = function(action, options) {

    const {
      display,
      getPlugin
    } = options;

    if (action === 'toggleSimulationAnalysis') {
        const simulationModeToggle = getPlugin('simulationModeToggle');
        if (simulationModeToggle) {
            simulationModeToggle.toggle();
        }
        return;
    }

    // forward other actions to the active tab
    const tab = display.getActiveTab();

    if (tab) {
      tab.triggerAction(action, options);
    }
  };
}

module.exports = {
  name: 'Analisis de Simulacion y Token Simulation',
  version: '0.22.0',
  script: './client/client.bundle.js',
  style: './client/assets/bpmn-js-token-simulation/css/bpmn-js-token-simulation.css',
  plugin: SimulationAnalysisPlugin
};

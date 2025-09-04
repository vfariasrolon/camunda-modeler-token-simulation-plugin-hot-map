import {
  registerBpmnJSPlugin,
  registerBpmnJSModdleExtension,
  registerClientPlugin
} from 'camunda-modeler-plugin-helpers';

// Main simulation module
import TokenSimulationModule from 'bpmn-js-token-simulation';

// Helpers
import HideModelerElements from './HideModelerElements';

// Heatmap feature
import HeatmapExtension from '../resources/heatmap-extension.json';
import Heatmap from './Heatmap';
import PropertiesProvider from './PropertiesProvider';


/**
 * A module that hides modeler-specific elements during simulation.
 */
const TokenSimulationHacks = {
  __init__: [ 'hideModelerElements' ],
  hideModelerElements: [ 'type', HideModelerElements ]
};

/**
 * A module that adds the heatmap visualization button to the palette.
 */
const HeatmapModule = {
  __init__: [ 'heatmap' ],
  heatmap: [ 'type', Heatmap ]
};

/**
 * A module that adds the properties panel entry.
 */
const PropertiesProviderModule = {
  __init__: [ 'propertiesProvider' ],
  propertiesProvider: [ 'type', PropertiesProvider ]
};


// 1. Register the custom moddle extension for the heatmap data
registerBpmnJSModdleExtension(HeatmapExtension);

// 2. Register the token simulation module
registerBpmnJSPlugin(TokenSimulationModule);

// 3. Register a module to hide modeler elements in simulation mode
registerBpmnJSPlugin(TokenSimulationHacks);

// 4. Register the module to add the heatmap button to the palette
registerBpmnJSPlugin(HeatmapModule);

// 5. Register the properties provider.
// The type 'bpmn.properties' is used by the modeler to identify
// properties panel providers.
registerClientPlugin(PropertiesProviderModule, 'bpmn.properties');

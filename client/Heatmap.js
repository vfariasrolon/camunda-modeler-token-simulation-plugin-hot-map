// client/Heatmap.js
import {
  domify,
  event as domEvent
} from 'min-dom';

import randomColor from 'randomcolor';

// Using a random icon for now, for example, the fork icon.
import { ForkIcon } from 'bpmn-js-token-simulation/lib/icons';

export default function Heatmap(
    eventBus,
    elementRegistry,
    elementColors,
    tokenSimulationPalette
) {
  this._elementRegistry = elementRegistry;
  this._elementColors = elementColors;
  this._tokenSimulationPalette = tokenSimulationPalette;

  eventBus.on('tokenSimulation.simulator.created', () => {
    this.addTestButton();
  });
}

Heatmap.prototype.addTestButton = function() {
  // Ensure we don't add the button multiple times
  if (document.querySelector('.bts-entry[title="Colorize Tasks"]')) {
    return;
  }

  const paletteEntry = domify(`
    <div class="bts-entry" title="Colorize Tasks">
      ${ ForkIcon() }
    </div>
  `);

  domEvent.bind(paletteEntry, 'click', () => {
    console.log('[DEBUG] Colorize Tasks button clicked!');
    this.applyRandomColors();
  });

  // Add to the simulation palette, at position 4 (after log)
  this._tokenSimulationPalette.addEntry(paletteEntry, 4);
};

Heatmap.prototype.applyRandomColors = function() {
  const tasks = this._elementRegistry.filter(function(element) {
    return element.type.includes('Task');
  });

  tasks.forEach(task => {
    const color = randomColor();

    console.log(`[DEBUG] Coloring ${task.id} with ${color}`);

    this._elementColors.add(task, 'heatmap-color', {
      stroke: 'black',
      fill: color
    });
  });
};

Heatmap.$inject = [
  'eventBus',
  'elementRegistry',
  'elementColors',
  'tokenSimulationPalette'
];

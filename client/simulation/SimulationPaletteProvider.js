import { is } from 'bpmn-js/lib/util/ModelUtil';

const GearIcon = '<path d="M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22Z" />';

export default class SimulationPaletteProvider {
  constructor(palette, selection, propertiesPanel) {
    this._palette = palette;
    this._selection = selection;
    this._propertiesPanel = propertiesPanel;

    // The provider is registered via the module system.
    // Calling registerProvider here is incorrect and causes a crash.
  }

  getPaletteEntries(element) {
    const selectedElements = this._selection.get();
    if (selectedElements.length !== 1) {
      return {};
    }

    const selected = selectedElements[0];

    // Show config button for Tasks and Sequence Flows
    if (!is(selected, 'bpmn:Task') && !is(selected, 'bpmn:SequenceFlow') && !is(selected, 'bpmn:StartEvent')) {
      return {};
    }

    return {
      'simulation-properties': {
        group: 'tools',
        className: 'simulation-properties-button',
        title: 'Configurar Simulación',
        html: `<div class="entry"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${GearIcon}</svg></div>`,
        action: {
          click: (event) => {
            this._propertiesPanel.open(selected);
          }
        }
      }
    };
  }
}

SimulationPaletteProvider.$inject = [
  'palette',
  'selection',
  'propertiesPanel'
];

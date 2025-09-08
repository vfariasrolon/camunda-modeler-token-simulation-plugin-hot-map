import RandomDataGenerator from './RandomDataGenerator';
import SimulationConfigReader from './SimulationConfigReader';
import SimulationEngine from './SimulationEngine';

/**
 * Controlador principal para orquestar la simulación.
 */
export default class SimulationController {
  constructor(injector, elementRegistry, modeling, moddle, toggleMode, eventBus) {
    this._injector = injector;
    this._elementRegistry = elementRegistry;
    this._modeling = modeling;
    this._moddle = moddle;
    this._toggleMode = toggleMode;
    this._eventBus = eventBus;

    this._randomDataGenerator = this._injector.instantiate(RandomDataGenerator);
    this._configReader = this._injector.instantiate(SimulationConfigReader);

    this._simulationResults = null;

    // Listen for menu action to generate random data
    this._eventBus.on('menu:action', (context) => {
      if (context.action === 'generateRandomData') {
        this.generateRandomData();
      }
    });
  }

  /**
   * Ejecuta el generador de datos aleatorios.
   */
  generateRandomData() {
    // Si la simulación de tokens está activa, la desactivamos primero.
    if (this._toggleMode.active) {
      this._toggleMode.toggle();
    }

    this._randomDataGenerator.generateData();

    // Invalidar resultados anteriores
    this._simulationResults = null;
  }

  /**
   * Inicia una nueva ejecución de la simulación y devuelve los resultados.
   * @param {string} viewType - El tipo de vista a mostrar (cost, waitTime, etc.).
   */
  runSimulation(viewType) {
    // Si la simulación de tokens está activa, la desactivamos primero.
    if (this._toggleMode.active) {
      this._toggleMode.toggle();
    }

    console.log("Iniciando simulación...");

    // 1. Leer la configuración actual del diagrama
    const config = this._configReader.readAll();
    if (!config || !config.global || !config.global.simulationConfig) {
        alert('Por favor, configure los parámetros de simulación en el Pool/Proceso principal antes de ejecutar.');
        return;
    }

    // 2. Instanciar y correr el motor de simulación
    const engine = new SimulationEngine(config, this._elementRegistry);
    this._simulationResults = engine.run();

    // 3. Pasar resultados al visualizador (Heatmap.js)
    const heatmap = this._injector.get('heatmap', false);
    if (heatmap) {
      heatmap.displayResults(this._simulationResults, viewType);
    } else {
      console.error("Módulo Heatmap no encontrado.");
    }
  }
}

SimulationController.$inject = ['injector', 'elementRegistry', 'modeling', 'moddle', 'toggleMode', 'eventBus'];

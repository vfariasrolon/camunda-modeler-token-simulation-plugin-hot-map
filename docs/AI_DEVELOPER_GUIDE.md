# Guía para Desarrolladores de IA: Lectura y Escritura de Datos de Simulación

Este documento es una guía técnica para agentes de IA. Describe cómo interactuar con los datos de simulación (`simulationData`) almacenados dentro de los diagramas BPMN en este proyecto.

## 1. Arquitectura de Datos

Los datos de simulación se guardan directamente dentro del XML del BPMN como una `camunda:Property` con `name="simulationData"`. El valor de esta propiedad es una **cadena de texto JSON escapada**.

**Ejemplo de XML para una Tarea:**
```xml
<bpmn:task id="Activity_123" name="Mi Tarea">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="simulationData" value="{&quot;processingTime&quot;:{&quot;value&quot;:10}}" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:task>
```

## 2. Guía Técnica para LEER `simulationData`

Usa los servicios `selection` y `elementRegistry` para obtener el elemento, y luego la función de ayuda `getSimulationData(element)` de `client/simulation/util.js` para leer y parsear el JSON.

```javascript
import { getSimulationData } from './util';
// ...
const element = selection.get()[0];
const data = getSimulationData(element);
// data es ahora un objeto JavaScript o null
```

## 3. Guía Técnica para ESCRIBIR `simulationData`

Usa los servicios `modeling` y `bpmnFactory` para crear y actualizar las propiedades.

**Pasos:**
1.  Prepara tu objeto de datos: `const newData = { ... };`
2.  Conviértelo a string: `const dataString = JSON.stringify(newData);`
3.  Obtén o crea `extensionElements` y `camunda:Properties`.
4.  Obtén o crea la `camunda:Property` `simulationData`.
5.  Asigna el `dataString` a `simProperty.value`.
6.  Llama a `modeling.updateProperties(element, { extensionElements });` para aplicar los cambios.

## 4. Estructura Detallada del JSON `simulationData`

**A. Para un `bpmn:Task`:**
```json
{
  "processingTime": { "distribution": "...", "unit": "...", "value": 0, "min": 0, "mode": 0, "max": 0 },
  "cost": { "value": 0, "currency": "USD" },
  "resources": { "pool": "...", "quantityRequired": 1 },
  "failureRate": 0.0,
  "reworkTime": { "distribution": "...", "unit": "...", "value": 0 }
}
```

**B. Para un Flujo de Secuencia saliente de una Compuerta Exclusiva:**
```json
{ "branchingProbability": 0.75 }
```

**C. Para un Evento de Inicio:**
```json
{ "arrivalRate": { "distribution": "...", "unit": "...", "value": 0 } }
```

**D. Para el Proceso o un Participante:**
```json
{
  "simulationConfig": { "runValue": 1000 },
  "resourcePools": [ { "name": "...", "quantity": 0 } ]
}
```

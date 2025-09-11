# Guía para Desarrolladores de IA: Lectura y Escritura de Datos de Simulación

Este documento es una guía técnica para agentes de IA. Describe cómo interactuar con los datos de simulación (`simulationData`) almacenados dentro de los diagramas BPMN en este proyecto. El objetivo es permitir que un agente pueda construir nuevas herramientas, como un panel de propiedades, para editar estos datos.

## 1. Arquitectura de Datos: ¿Dónde se guardan los datos?

Los datos de simulación no se guardan en un archivo separado. Se almacenan directamente dentro del archivo `.bpmn` (que es un XML) como una **propiedad de extensión de Camunda**.

- **Elemento Raíz**: `bpmn:ExtensionElements`
- **Contenedor**: `camunda:Properties`
- **Propiedad**: `camunda:Property` con el atributo `name="simulationData"`
- **Valor**: El valor de esta propiedad es una **cadena de texto (string) que contiene un objeto JSON**.

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
**Nota Importante:** El JSON dentro del atributo `value` está escapado en formato XML (ej. `"` se convierte en `&quot;`). Las herramientas de `bpmn-js` manejan esto automáticamente.

## 2. Guía Técnica para LEER `simulationData`

Para leer el JSON de un elemento del diagrama, necesitas usar los servicios que provee `bpmn-js`.

**Servicios Requeridos (Inyección de Dependencias):**
- `selection`: Para saber qué elemento ha seleccionado el usuario.
- `elementRegistry`: Para obtener el objeto completo del elemento a partir de su ID.

**Pasos:**
1.  **Obtener el Elemento Seleccionado**:
    ```javascript
    const selectedElements = selection.get();
    if (selectedElements.length !== 1) return; // Solo proceder si hay un único elemento seleccionado
    const element = selectedElements[0];
    ```

2.  **Acceder al `businessObject`**: Este es el objeto que contiene los datos subyacentes del modelo.
    ```javascript
    const businessObject = element.businessObject;
    ```

3.  **Obtener `extensionElements`**:
    ```javascript
    const extensionElements = businessObject.get('extensionElements');
    if (!extensionElements) return null; // No hay datos de simulación
    ```

4.  **Obtener `camunda:Properties`**:
    ```javascript
    const properties = extensionElements.get('values').find(v => v.$type === 'camunda:Properties');
    if (!properties) return null;
    ```

5.  **Obtener la Propiedad `simulationData`**:
    ```javascript
    const simProperty = properties.get('values').find(p => p.name === 'simulationData');
    if (!simProperty) return null;
    ```

6.  **Parsear el JSON**: El valor (`simProperty.value`) es un string. Hay que convertirlo a un objeto JavaScript.
    ```javascript
    try {
      const simulationData = JSON.parse(simProperty.value);
      return simulationData;
    } catch (e) {
      console.error("Error parsing simulationData JSON", e);
      return null;
    }
    ```

## 3. Guía Técnica para ESCRIBIR `simulationData`

Para modificar o crear los datos, el proceso es similar pero a la inversa. Se necesitan los servicios `modeling` y `bpmnFactory`.

**Servicios Requeridos:**
- `modeling`: El servicio principal para realizar cambios en el diagrama.
- `bpmnFactory`: Para crear nuevos elementos de BPMN (como `camunda:Property`) de forma segura.
- `elementRegistry`, `selection`: Para obtener el elemento a modificar.

**Pasos:**
1.  **Obtener el Elemento y `businessObject`**: Igual que en la lectura.
2.  **Preparar los Nuevos Datos**: Ten tu objeto JavaScript con los datos de simulación listos.
    ```javascript
    const newData = { processingTime: { value: 20 } }; // Tu nuevo objeto de datos
    const simulationDataString = JSON.stringify(newData, null, 2);
    ```
3.  **Obtener o Crear `extensionElements`**:
    ```javascript
    let extensionElements = businessObject.get('extensionElements');
    if (!extensionElements) {
      extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    }
    ```
4.  **Obtener o Crear `camunda:Properties`**:
    ```javascript
    let properties = extensionElements.get('values').find(v => v.$type === 'camunda:Properties');
    if (!properties) {
      properties = bpmnFactory.create('camunda:Properties', { values: [] });
      extensionElements.get('values').push(properties);
    }
    ```
5.  **Obtener o Crear la Propiedad `simulationData`**:
    ```javascript
    let simProperty = properties.get('values').find(p => p.name === 'simulationData');
    if (!simProperty) {
      simProperty = bpmnFactory.create('camunda:Property', { name: 'simulationData' });
      properties.get('values').push(simProperty);
    }
    ```
6.  **Asignar el Nuevo Valor y Actualizar el Modelo**:
    ```javascript
    simProperty.value = simulationDataString;

    // Usar modeling.updateProperties para aplicar todos los cambios al diagrama
    modeling.updateProperties(element, {
      extensionElements: extensionElements
    });
    ```

## 4. Prompt de Ejemplo para un Agente de IA

A continuación, se presenta un prompt de ejemplo que puedes usar para pedirle a otro agente de IA que construya un panel de propiedades para editar estos datos.

---

## 5. Lógica de Recursos y Transporte (Notas Importantes)

### Lógica de Múltiples Recursos por Tarea
- El motor de simulación ahora soporta que una tarea requiera múltiples recursos de la misma piscina.
- El dato se define en el JSON de la tarea, dentro del objeto `resources`:
  ```json
  "resources": {
    "pool": "Analistas",
    "quantityRequired": 2
  }
  ```
- El `ResourcePool` fue modificado para manejar peticiones y liberaciones de una cantidad variable de recursos.

### Lógica de Transporte (Desactivada)
- Se implementó una lógica compleja para simular transporte y lotes (batching), pero resultó ser inestable y causaba que la simulación se atascara.
- **Estado Actual**: Toda la lógica de transporte ha sido **desactivada** en `SimulationEngine.js` comentando el código relevante.
- **Para Futuros Desarrolladores**: Si se desea reactivar esta funcionalidad, se debe revisar cuidadosamente la clase `TransportPool` y la interacción con los eventos `TASK_COMPLETE` y `TRANSPORT_ARRIVED`. El principal desafío es manejar los lotes que no se llenan y el estado de los vehículos (disponibilidad).

### Consumo de Datos por el Panel de Gráficos
- Un ejemplo clave del consumo de estos datos es el **Panel de Gráficos** (`ChartPanel.js` y `SimulationController.js`).
- Este panel lee los resultados agregados de la simulación (que se basan en los `simulationData` de cada tarea) para generar visualizaciones como:
  - Gráficos de barras con los "Top 5" por costo, tiempo, etc.
  - Un diagrama de dispersión que cruza el costo total con el tiempo de proceso promedio.
  - Un diagrama de Pareto para analizar las fuentes de fallos.
- La creación de un panel de propiedades para editar `simulationData` permitiría a los usuarios influir directamente en los resultados de estos análisis.

**Prompt para el Agente de IA:**

"Hola. Necesito que construyas un nuevo plugin para este Camunda Modeler que funcione como un **Panel de Propiedades para los Datos de Simulación**.

**Objetivo:**
El usuario debe poder seleccionar un elemento del diagrama (Tarea, Evento de Inicio, Compuerta Exclusiva, etc.) y ver un panel donde pueda introducir y modificar sus datos de simulación específicos.

**Requisitos Técnicos Detallados:**

1.  **Activación y Comportamiento del Panel**:
    -   El panel debe ser una ventana modal o un panel lateral que se activa con un nuevo botón en la paleta principal.
    -   El panel debe reaccionar al evento `selection.changed` para cargar los datos del nuevo elemento seleccionado.

2.  **Lectura y Escritura de Datos**:
    -   Utiliza los servicios `selection`, `elementRegistry`, `modeling` y `bpmnFactory` como se describe en la `AI_DEVELOPER_GUIDE.md` para leer y escribir el string JSON en la propiedad `simulationData`.

3.  **Estructura de Datos JSON `simulationData` (MUY IMPORTANTE)**:
    -   El panel debe generar un objeto JavaScript que se ajuste **exactamente** a las siguientes estructuras, dependiendo del tipo de elemento BPMN seleccionado. Luego, este objeto se convierte a un string JSON para guardarlo.

    **A. Para un `bpmn:Task` (o UserTask, ScriptTask, etc.):**
    ```json
    {
      "processingTime": {
        "distribution": "fixed", // "fixed" o "triangular"
        "value": 10,           // Para "fixed"
        "unit": "minutes",     // "minutes" u "hours"
        "min": 5,              // Para "triangular"
        "mode": 10,            // Para "triangular"
        "max": 15              // Para "triangular"
      },
      "cost": {
        "value": 25.50,
        "currency": "USD"
      },
      "resources": {
        "pool": "Analistas",     // Nombre del pool de recursos
        "quantityRequired": 1  // Cuántos recursos de este pool se necesitan
      },
      "failureRate": 0.05,       // Probabilidad de fallo (0.0 a 1.0)
      "reworkTime": {            // Igual que processingTime, para cuando ocurre un fallo
        "distribution": "fixed",
        "value": 20,
        "unit": "minutes"
      }
    }
    ```

    **B. Para un Flujo de Secuencia (`bpmn:SequenceFlow`) saliente de una Compuerta Exclusiva (`bpmn:ExclusiveGateway`):**
    ```json
    {
      "branchingProbability": 0.75 // Probabilidad de que se elija este camino (0.0 a 1.0)
    }
    ```

    **C. Para un Evento de Inicio (`bpmn:StartEvent`):**
    ```json
    {
      "arrivalRate": {
        "distribution": "fixed",
        "value": 60,           // Instancias que llegan
        "unit": "minute"       // "minute" u "hour"
      }
    }
    ```

    **D. Para el Proceso (`bpmn:Process`) o un Participante (`bpmn:Participant`):**
    ```json
    {
      "simulationConfig": {
        "runValue": 1000       // Número de instancias a simular
      },
      "resourcePools": [
        {
          "name": "Analistas",  // Nombre del pool
          "quantity": 5        // Cantidad de recursos disponibles
        },
        {
          "name": "Desarrolladores",
          "quantity": 3
        }
      ]
    }
    ```

4.  **Interfaz del Panel**:
    -   La interfaz debe ser dinámica y mostrar solo los campos relevantes para el tipo de elemento seleccionado.
    -   Por ejemplo, si se selecciona una Tarea, muestra campos para tiempo, costo, recursos y fallos. Si se selecciona un Flujo de Secuencia, solo muestra el campo para la probabilidad de ramificación.

5.  **Guía de Referencia**: Usa la `AI_DEVELOPER_GUIDE.md` como tu principal referencia técnica para la interacción con el modelo BPMN.

**Plan de Trabajo Sugerido:**
1.  Crea un nuevo módulo para el panel (ej. `client/properties/`).
2.  Implementa la lógica del botón en la paleta principal y el listener para `selection.changed`.
3.  Crea el HTML/CSS para la interfaz del panel, con todos los posibles campos de entrada ocultos por defecto.
4.  Implementa la lógica de lectura de datos que, según el tipo de elemento, muestra los campos correctos y los rellena.
5.  Implementa la lógica de guardado que construye el objeto JSON correcto según los campos visibles y lo guarda en el elemento."
---

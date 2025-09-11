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

**Prompt para el Agente de IA:**

"Hola. Necesito que construyas un nuevo plugin para este Camunda Modeler que funcione como un **Panel de Propiedades para los Datos de Simulación**.

**Objetivo:**
El usuario debe poder seleccionar una Tarea (`bpmn:Task`) en el diagrama y ver un panel donde pueda introducir y modificar los datos de simulación, como el `processingTime` y el `cost`.

**Requisitos Técnicos:**
1.  **Activación del Panel**: El panel debe aparecer cuando el usuario haga clic en un nuevo botón en la paleta de herramientas principal (la que está a la izquierda). Usa el servicio `palette` para registrar un nuevo botón con un icono de engranaje o similar.
2.  **Lectura de Datos**:
    -   Cuando el panel se abre, debe leer los `simulationData` del elemento seleccionado actualmente.
    -   Los datos están en una `camunda:Property` con `name="simulationData"` dentro de `bpmn:ExtensionElements`. El valor es un string JSON.
    -   Debes usar los servicios `selection` y `elementRegistry` para obtener el elemento y sus datos. Parsea el JSON para rellenar los campos del panel.
3.  **Interfaz del Panel**:
    -   El panel debe ser una ventana modal o un panel lateral.
    -   Debe tener campos de entrada para:
        -   `processingTime` (valor, unidad, distribución)
        -   `cost` (valor, moneda)
        -   `failureRate` (un número entre 0 y 1)
4.  **Escritura de Datos**:
    -   Al hacer clic en un botón "Guardar" en el panel, debes tomar los valores de los campos de entrada.
    -   Construye un nuevo objeto JavaScript con estos datos.
    -   Conviértelo a un string JSON.
    -   Usa `bpmnFactory` para crear los elementos (`bpmn:ExtensionElements`, `camunda:Properties`, `camunda:Property`) si no existen.
    -   Usa `modeling.updateProperties` para guardar el nuevo string JSON en la propiedad `simulationData` del elemento.
5.  **Guía de Referencia**: He creado un archivo `AI_DEVELOPER_GUIDE.md` que explica en detalle cómo leer y escribir estos datos. Por favor, úsalo como tu principal referencia técnica.

**Plan de Trabajo Sugerido:**
1.  Crea un nuevo módulo para el panel (ej. `client/properties/`).
2.  Implementa la lógica del botón en la paleta principal.
3.  Crea el HTML/CSS para la interfaz del panel.
4.  Implementa la lógica de lectura de datos cuando se abre el panel.
5.  Implementa la lógica de guardado de datos."
---

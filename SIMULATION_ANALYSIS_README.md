# Documentación del Módulo de Análisis de Simulación

Este documento detalla el funcionamiento y uso de la funcionalidad de "Análisis de Simulación de Procesos" en este plugin de Camunda Modeler.

## I. Flujo de Trabajo: De Modelo a Decisión

El flujo de trabajo está diseñado para ser intuitivo y se divide en tres pasos principales:

### Paso 1: Configurar la Simulación (en el Evento de Inicio)

Toda la configuración de la simulación se centraliza en un único **Evento de Inicio (`bpmn:StartEvent`)**.

1.  Selecciona el Evento de Inicio de tu proceso.
2.  En el panel de propiedades, marca la casilla **"Usar como Configuración Raíz"**.
3.  Aparecerá un formulario donde podrás configurar todos los parámetros globales:
    *   **Configuración de Simulación**: Define cuántas instancias del proceso quieres simular (ej. 100 piezas).
    *   **Tasa de Llegada**: ¿Con qué frecuencia inicia un nuevo caso? (ej. 1 cada 5 minutos).
    *   **Calendario Laboral**: Define los días y horas de trabajo, así como los días festivos.
    *   **Costos y Horas Extras**: Define la tarifa por hora base y las reglas para el pago de horas extras (cuándo se pagan al doble o al triple).

### Paso 2: Definir Parámetros de las Tareas

1.  Selecciona una Tarea (`bpmn:Task`) en tu diagrama.
2.  En el panel de propiedades, define sus parámetros específicos:
    *   **Tiempo de Procesamiento**: ¿Cuánto tiempo toma realizar la tarea?
    *   **Tasa de Fallo y Tiempo de Reparación**: ¿Qué probabilidad hay de que la tarea falle y cuánto tiempo extra cuesta repararla?
    *   **Recursos**: Si has definido "piscinas de recursos" (en el elemento Proceso o Participante), aquí puedes asignar cuántos recursos de una piscina necesita la tarea.

### Paso 3: Ejecutar y Analizar

1.  **Ejecutar**: En la barra de herramientas de la izquierda, haz clic en el botón de **reproducir (▶️)**. El motor ejecutará **tres escenarios** en segundo plano, **sobre la misma semilla** (así la diferencia se debe al plan y no a la suerte): **sin horas extra**, **con el tope legal aplicado** y **sin tope**. El escenario con tope aplica los tres límites de la LFT —9 h/semana, 3 h/día y 3 días con extra por semana— y lo que no cabe **espera a la semana siguiente**, que es lo que obliga la ley.
2.  **Analizar**: Haz clic en el botón de **gráfico de barras (📊)** para abrir el panel de análisis.

## II. El Panel de Análisis: Tu Centro de Mando

El panel de análisis es donde podrás entender el rendimiento de tu proceso. Se abre con el botón del **gráfico de barras (📊)**.

### Iconos de Acceso Rápido

En la cabecera del panel, junto al menú desplegable, encontrarás dos nuevos iconos para acceder a las vistas de resumen más importantes:

*   **Icono de Reloj (🕒) - Ver Resumen General**: Abre una ventana que muestra las métricas totales más importantes de la simulación (considerando el plan con horas extras).
*   **Icono de Dólar ($) - Ver Comparativo de Planes**: Abre la herramienta de análisis más potente. Presenta **los tres escenarios** frente a frente con su costo, su plazo y sus piezas, y debajo la tabla comparativa y las **tres curvas de producción acumulada** superpuestas en los mismos ejes. Incluye la **nota del tope legal**, que distingue los tres desenlaces que importan: si cumplir la ley produce **lo mismo y cuesta menos**, las horas extra libres se estaban pagando sin mover el resultado; si produce **menos**, ahí está el precio de la legalidad en cifras; y si produce lo mismo y cuesta **más**, el cuello no es el reloj sino los recursos.

### Gráficos y Tablas Detalladas

Usa el **menú desplegable** principal para cambiar entre diferentes tipos de gráficos y tablas que te permitirán un análisis más profundo de aspectos específicos, como:
*   **Análisis de Producción**: Compara la producción diaria entre el plan normal y el de horas extras.
*   **Top 5 por Costo/Tiempo**: Identifica rápidamente las tareas más costosas o que más tiempo consumen.
*   **Diagramas de Pareto**: Aplica el principio 80/20 para encontrar las causas raíz de los fallos o los altos costos.
*   **Tabla de Resultados**: Ve una tabla con todas las métricas detalladas para cada elemento del proceso.

### Las tres vistas del mapa de calor

En la paleta de la izquierda hay **tres** vistas que pintan sobre el diagrama, y conviene saber cuál contesta qué:

| Vista | Qué mide | Cómo se lee |
|---|---|---|
| **Colorear LÍNEAS y tareas según el tráfico** | Cuántos tokens recorrieron cada **conexión** | El **color** es la **cuota de la rama** —qué parte de lo que llegaba a ese punto siguió por aquí: el 80 % por aquí, el 20 % por allí— y el **grosor** son los tokens. La **ruta dominante** va contorneada con un halo |
| **Mapa de zonas: por dónde PASAN los tokens** | Cuántas veces pasó el token por cada **trozo** del diagrama | Una mancha continua. Los colores reparten las celdas **por puestos**: el rojo es siempre la zona más cargada de este diagrama |
| **Mapa de zonas: dónde se va el TIEMPO** | Minutos de trabajo (ejecuciones × duración) por trozo | La misma rejilla, pesando la duración. Una tarea de 5 s con 500 tokens apenas la mueve; una de 2 h con dos casos la enciende |

**Comparar las dos últimas dice si el problema es el volumen o la duración**, que es la distinción que decide si hay que atacar la frecuencia de paso o el tiempo de cada tarea.

Las conexiones por las que **no pasó nada** salen en **gris discontinuo**, y no en el extremo frío de la escala: «poca carga» y «ninguna carga» son cosas distintas. Una rama que no se usa es capacidad que se paga y no se aprovecha, y por eso se marca aparte.

#### De dónde salen los números

El motor cuenta los pasos por conexión en `findNextElements`: en una **compuerta exclusiva** sortea con la probabilidad de rama declarada (si no declaras ninguna, reparte a partes iguales) y en una **compuerta paralela** toma todas las salidas. Todo eso queda en el informe de consola bajo `SALIDAS · por conexión`, con los pasos y la cuota de cada línea, **incluidas las que no se recorrieron**.

Dos comprobaciones que se pueden hacer a mano para validar un esquema:

*   En cualquier nodo que **no** sea una bifurcación paralela, **lo que entra es lo que sale** (la suma de los pasos que llegan al nodo es la de los que salen).
*   La suma de los pasos de todas las conexiones **no** es el número de tokens: cada token se cuenta una vez por cada conexión que cruza. Con 100 casos y 1371 pasos, cada caso pasó por unas 13,7 líneas.

## III. Guía para Desarrolladores de IA

Para extender esta funcionalidad o construir nuevas herramientas, consulta la guía técnica detallada:
[**Guía para Desarrolladores de IA](./client/simulation/AI_DEVELOPER_GUIDE.md)**

import {
  Chart,
  BarController,
  LineController,
  ScatterController,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  Filler // Filler es necesario para los gráficos de Pareto/línea si usan 'fill'
} from 'chart.js';

// Registra solo los componentes que realmente usas
Chart.register(
  BarController,
  LineController,
  ScatterController,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  Filler
);

// Exporta la clase Chart ya configurada
export { Chart };

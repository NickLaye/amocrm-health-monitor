import React, { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { format } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function ResponseTimeChart({ data, colors, labels }) {
  const chartRef = useRef(null);

  const prepareChartData = () => {
    const datasets = [];

    Object.entries(data).forEach(([checkType, checks]) => {
      if (checks.length === 0) {
        return;
      }

      // Sort by timestamp
      const sortedChecks = [...checks].sort((a, b) => a.timestamp - b.timestamp);
      
      // Sample data to avoid too many points (max 100 points)
      const sampleRate = Math.ceil(sortedChecks.length / 100);
      const sampledChecks = sortedChecks.filter((_, index) => index % sampleRate === 0);

      datasets.push({
        label: labels[checkType] || checkType,
        data: sampledChecks.map(check => ({
          x: check.timestamp,
          y: check.response_time / 1000 // Convert to seconds
        })),
        borderColor: colors[checkType] || '#000',
        backgroundColor: `${colors[checkType]}22` || '#00000022',
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBorderWidth: 2,
        pointHoverBackgroundColor: '#0f172a',
        tension: 0.3,
        fill: true
      });
    });

    return {
      datasets
    };
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    hover: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        position: 'bottom',
        align: 'center',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            weight: '600'
          },
          boxWidth: 10,
          boxHeight: 10,
        },
        margin: {
          top: 10,
          bottom: 12
        },
        padding: {
          top: 0,
          bottom: 12
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#F8FAFC',
        bodyColor: '#E2E8F0',
        padding: 12,
        cornerRadius: 8,
        titleFont: {
          size: 13,
          weight: '600'
        },
        bodyFont: {
          size: 12,
          weight: '600'
        },
        callbacks: {
          title: (context) => {
            const timestamp = context[0].parsed.x;
            return format(new Date(timestamp), 'dd.MM.yyyy HH:mm:ss');
          },
          label: (context) => {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(3)} сек`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        title: {
          display: true,
          text: 'Время',
          font: {
            size: 12,
            weight: '600'
          },
          color: '#e2e8f0'
        },
        grid: {
          color: 'rgba(71, 85, 105, 0.3)',
          lineWidth: 1,
          borderColor: 'rgba(71, 85, 105, 0.6)'
        },
        ticks: {
          callback: function(value) {
            return format(new Date(value), 'HH:mm');
          },
          maxRotation: 45,
          minRotation: 45,
          font: {
            size: 11,
            weight: '600'
          },
          color: '#94a3b8'
        }
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Время ответа (сек)',
          font: {
            size: 12,
            weight: '600'
          },
          color: '#e2e8f0'
        },
        ticks: {
          font: {
            size: 11,
            weight: '600'
          },
          color: '#94a3b8',
          callback: function(value) {
            return value.toFixed(2);
          }
        },
        grid: {
          color: 'rgba(71, 85, 105, 0.3)',
          lineWidth: 1,
          borderColor: 'rgba(71, 85, 105, 0.6)'
        }
      }
    }
  };

  const chartData = prepareChartData();

  if (chartData.datasets.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        Нет данных для отображения
      </div>
    );
  }

  return (
    <div className="relative h-[32rem]">
      <Line ref={chartRef} data={chartData} options={options} />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 border-t border-slate-800/60"
      />
    </div>
  );
}

export default ResponseTimeChart;


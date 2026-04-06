<script>
  import { onMount, onDestroy } from 'svelte'
  import { appState } from '../../lib/stores.svelte.js'
  import { getCumulativeRounds } from '../../lib/db.js'
  import { strings } from '../../lib/strings.js'
  import { Chart, LineController, LineElement, PointElement, LinearScale, TimeScale, Tooltip, Legend } from 'chart.js'
  import 'chartjs-adapter-date-fns'

  Chart.register(LineController, LineElement, PointElement, LinearScale, TimeScale, Tooltip, Legend)

  let { firearmId, refreshTrigger } = $props()

  let canvas = $state(null)
  let chart = null

  function buildChart(data) {
    if (chart) {
      chart.destroy()
      chart = null
    }
    if (!canvas) return
    if (data.length === 0) return

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [
          {
            label: strings.chart.yAxisLabel,
            data: data.map((row) => ({ x: row.date, y: row.cumulative })),
            borderColor: '#d97706',
            backgroundColor: 'rgba(217,119,6,0.1)',
            tension: 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          x: {
            type: 'time',
            time: { displayFormats: { day: strings.chart.dateFormat } },
            ticks: { color: '#a8a29e' },
            grid: { color: '#57534e' },
          },
          y: {
            title: { display: true, text: strings.chart.yAxisLabel, color: '#a8a29e' },
            ticks: { color: '#a8a29e' },
            grid: { color: '#57534e' },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    })
  }

  onMount(() => {
    const data = getCumulativeRounds(appState.dbInstance, firearmId)
    buildChart(data)
  })

  $effect(() => {
    // Re-run when refreshTrigger changes (after mutations)
    if (refreshTrigger >= 0 && canvas && appState.dbInstance) {
      const data = getCumulativeRounds(appState.dbInstance, firearmId)
      buildChart(data)
    }
  })

  onDestroy(() => {
    if (chart) {
      chart.destroy()
      chart = null
    }
  })
</script>

<div class="rounded bg-surface p-4">
  {#if getCumulativeRounds(appState.dbInstance, firearmId).length === 0}
    <p class="text-center text-sm text-text-muted">{strings.chart.noDataLabel}</p>
  {:else}
    <canvas bind:this={canvas}></canvas>
  {/if}
</div>

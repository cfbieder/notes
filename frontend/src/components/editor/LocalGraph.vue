<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGraphStore } from '../../stores/graph.js';
import * as d3 from 'd3';
import { ChevronRight, ChevronDown } from 'lucide-vue-next';

const props = defineProps({
  noteId: { type: String, required: true }
});

const router = useRouter();
const graphStore = useGraphStore();
const svgRef = ref(null);
const expanded = ref(false);
let simulation = null;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function themeColors() {
  return {
    primary: cssVar('--accent-primary') || '#3a86ff',
    success: cssVar('--accent-success') || '#4cc9f0',
    warn: cssVar('--accent-warn') || '#ff9f1c',
    textPrimary: cssVar('--text-primary') || '#ffffff'
  };
}

function onThemeChange() {
  if (expanded.value) renderGraph();
}

function renderGraph() {
  if (!svgRef.value) return;

  const { nodes, edges } = graphStore.localGraph;
  if (nodes.length === 0) return;

  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();

  const width = svgRef.value.clientWidth;
  const height = 200;

  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const g = svg.append('g');

  // Zoom
  svg.call(d3.zoom().scaleExtent([0.3, 3]).on('zoom', (event) => {
    g.attr('transform', event.transform);
  }));

  // Clone data for D3 (it mutates objects)
  const nodeData = nodes.map(n => ({ ...n }));
  const edgeData = edges.map(e => ({
    source: nodeData.find(n => n.id === e.source) || e.source,
    target: nodeData.find(n => n.id === e.target) || e.target,
    type: e.type
  })).filter(e => e.source && e.target && typeof e.source === 'object');

  simulation = d3.forceSimulation(nodeData)
    .force('link', d3.forceLink(edgeData).id(d => d.id).distance(60))
    .force('charge', d3.forceManyBody().strength(-80))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(15));

  const colors = themeColors();

  const link = g.append('g')
    .selectAll('line')
    .data(edgeData)
    .join('line')
    .attr('stroke', d => d.type === 'tag' ? colors.warn : colors.primary)
    .attr('stroke-opacity', d => d.type === 'tag' ? 0.45 : 0.5)
    .attr('stroke-width', d => d.type === 'tag' ? 1.5 : 2)
    .attr('stroke-dasharray', d => d.type === 'tag' ? '6,4' : null);

  const node = g.append('g')
    .selectAll('circle')
    .data(nodeData)
    .join('circle')
    .attr('r', d => {
      if (d.id === props.noteId) return 8;
      return d.type === 'tag' ? 4 : 6;
    })
    .attr('fill', d => {
      if (d.id === props.noteId) return colors.warn;
      if (d.type === 'tag') return d.color || colors.success;
      return colors.primary;
    })
    .attr('stroke', d => d.id === props.noteId ? colors.textPrimary : 'none')
    .attr('stroke-width', d => d.id === props.noteId ? 2 : 0)
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      if (d.type === 'note') router.push(`/notes/${d.id}`);
      else if (d.type === 'tag') router.push(`/tags/${d.title}`);
    })
    .call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x; d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      })
    );

  // Tooltips
  node.append('title').text(d => d.title);

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node
      .attr('cx', d => d.x).attr('cy', d => d.y);
  });
}

watch(() => [expanded.value, graphStore.localGraph], () => {
  if (expanded.value) {
    // Wait for DOM to update
    setTimeout(renderGraph, 50);
  }
}, { deep: true });

watch(() => props.noteId, () => {
  graphStore.fetchLocalGraph(props.noteId);
});

onMounted(() => {
  window.addEventListener('noted:theme-change', onThemeChange);
});

onBeforeUnmount(() => {
  if (simulation) simulation.stop();
  window.removeEventListener('noted:theme-change', onThemeChange);
});
</script>

<template>
  <div class="local-graph-panel" v-if="graphStore.localGraph.nodes.length > 1">
    <button class="graph-toggle" @click="expanded = !expanded">
      <ChevronDown v-if="expanded" :size="14" />
      <ChevronRight v-else :size="14" />
      <span>Local Graph</span>
    </button>
    <div v-if="expanded" class="graph-container">
      <svg ref="svgRef" width="100%" height="200"></svg>
    </div>
  </div>
</template>

<style scoped>
.local-graph-panel {
  border-top: 1px solid var(--border-subtle);
  padding: 8px 16px;
}

.graph-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.graph-toggle:hover {
  color: var(--text-primary);
}

.graph-container {
  margin-top: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  overflow: hidden;
  background: var(--hover-bg);
}

.graph-container svg {
  display: block;
}
</style>

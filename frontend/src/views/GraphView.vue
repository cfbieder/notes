<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useGraphStore } from '../stores/graph.js';
import * as d3 from 'd3';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import MobileLayout from '../components/mobile/MobileLayout.vue';
import { useMobile } from '../composables/useMobile.js';
import { Network, Tag, Eye, EyeOff, Search } from 'lucide-vue-next';

const { isMobile } = useMobile();
const router = useRouter();
const graphStore = useGraphStore();

const svgRef = ref(null);
const containerRef = ref(null);
const showTags = ref(true);
const showOrphans = ref(true);
const searchQuery = ref('');

let simulation = null;

onMounted(async () => {
  await graphStore.fetchFullGraph();
  renderGraph();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  if (simulation) simulation.stop();
  window.removeEventListener('resize', onResize);
});

watch([showTags, showOrphans], () => {
  renderGraph();
});

watch(searchQuery, () => {
  highlightSearch();
});

function onResize() {
  renderGraph();
}

function highlightSearch() {
  if (!svgRef.value) return;
  const query = searchQuery.value.toLowerCase();
  const svg = d3.select(svgRef.value);

  if (!query) {
    svg.selectAll('circle').attr('opacity', 1);
    svg.selectAll('line').attr('opacity', d => d.type === 'tag' ? 0.15 : 0.2);
    return;
  }

  svg.selectAll('circle').attr('opacity', d =>
    d.title.toLowerCase().includes(query) ? 1 : 0.15
  );
  svg.selectAll('line').attr('opacity', 0.05);
}

function renderGraph() {
  if (!svgRef.value || !containerRef.value) return;

  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();

  const { nodes, edges } = graphStore.fullGraph;
  if (nodes.length === 0) return;

  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;

  svg.attr('width', width).attr('height', height);

  const g = svg.append('g');

  // Zoom + pan
  svg.call(d3.zoom().scaleExtent([0.1, 5]).on('zoom', (event) => {
    g.attr('transform', event.transform);
  }));

  // Filter nodes
  let filteredNodes = [...nodes];
  if (!showTags.value) {
    filteredNodes = filteredNodes.filter(n => n.type !== 'tag');
  }

  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  let filteredEdges = edges.filter(e =>
    filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
  );

  if (!showOrphans.value) {
    const connectedIds = new Set();
    filteredEdges.forEach(e => { connectedIds.add(e.source); connectedIds.add(e.target); });
    filteredNodes = filteredNodes.filter(n => connectedIds.has(n.id));
  }

  // Clone data for D3
  const nodeData = filteredNodes.map(n => ({ ...n }));
  const nodeMap = new Map(nodeData.map(n => [n.id, n]));
  const edgeData = filteredEdges
    .map(e => ({
      source: nodeMap.get(e.source),
      target: nodeMap.get(e.target),
      type: e.type
    }))
    .filter(e => e.source && e.target);

  if (simulation) simulation.stop();

  simulation = d3.forceSimulation(nodeData)
    .force('link', d3.forceLink(edgeData).id(d => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => getRadius(d) + 4));

  // Edges
  const link = g.append('g')
    .selectAll('line')
    .data(edgeData)
    .join('line')
    .attr('stroke', d => d.type === 'tag' ? 'rgba(255, 159, 28, 0.15)' : 'rgba(58, 134, 255, 0.2)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', d => d.type === 'tag' ? '3,3' : null);

  // Nodes
  const node = g.append('g')
    .selectAll('circle')
    .data(nodeData)
    .join('circle')
    .attr('r', d => getRadius(d))
    .attr('fill', d => {
      if (d.type === 'tag') return d.color || '#4cc9f0';
      return '#3a86ff';
    })
    .attr('stroke', d => d.type === 'note' ? 'rgba(255, 255, 255, 0.2)' : 'none')
    .attr('stroke-width', 1)
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

  // Labels for nodes with connections
  const label = g.append('g')
    .selectAll('text')
    .data(nodeData.filter(d => d.linkCount > 0 || d.type === 'tag'))
    .join('text')
    .text(d => d.title.length > 20 ? d.title.slice(0, 18) + '...' : d.title)
    .attr('font-size', d => d.type === 'tag' ? '9px' : '10px')
    .attr('fill', 'rgba(255, 255, 255, 0.6)')
    .attr('text-anchor', 'middle')
    .attr('dy', d => getRadius(d) + 12)
    .attr('font-family', "'Inter', sans-serif")
    .style('pointer-events', 'none');

  // Tooltips
  node.append('title').text(d => {
    if (d.type === 'tag') return `#${d.title}`;
    return `${d.title} (${d.linkCount || 0} links)`;
  });

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node
      .attr('cx', d => d.x).attr('cy', d => d.y);
    label
      .attr('x', d => d.x).attr('y', d => d.y);
  });
}

function getRadius(d) {
  if (d.type === 'tag') return Math.min(4 + (d.linkCount || 0), 10);
  return Math.min(6 + (d.linkCount || 0) * 1.5, 18);
}
</script>

<template>
  <MobileLayout v-if="isMobile" title="Knowledge Graph">
    <div ref="containerRef" class="graph-container" style="height: calc(100vh - 56px);">
      <div class="graph-toolbar">
        <div class="filter-group">
          <button class="filter-btn" :class="{ active: showTags }" @click="showTags = !showTags">
            <Tag :size="14" />
            Tags
          </button>
          <button class="filter-btn" :class="{ active: showOrphans }" @click="showOrphans = !showOrphans">
            <Eye v-if="showOrphans" :size="14" />
            <EyeOff v-else :size="14" />
            Orphans
          </button>
        </div>
        <div class="search-group">
          <Search :size="14" />
          <input v-model="searchQuery" type="text" placeholder="Search nodes..." class="search-input" />
        </div>
      </div>
      <svg ref="svgRef"></svg>
    </div>
  </MobileLayout>

  <div v-else class="graph-layout">
    <AppSidebar />
    <div ref="containerRef" class="graph-container">
      <div class="graph-header">
        <Network :size="20" />
        <h2>Knowledge Graph</h2>
        <span class="graph-stats">{{ graphStore.fullGraph.nodes.length }} nodes</span>
      </div>

      <div class="graph-toolbar">
        <div class="filter-group">
          <button class="filter-btn" :class="{ active: showTags }" @click="showTags = !showTags">
            <Tag :size="14" />
            Tags
          </button>
          <button class="filter-btn" :class="{ active: showOrphans }" @click="showOrphans = !showOrphans">
            <Eye v-if="showOrphans" :size="14" />
            <EyeOff v-else :size="14" />
            Orphans
          </button>
        </div>
        <div class="search-group">
          <Search :size="14" />
          <input v-model="searchQuery" type="text" placeholder="Search nodes..." class="search-input" />
        </div>
      </div>

      <div v-if="graphStore.loading" class="loading">Loading graph...</div>
      <svg v-else ref="svgRef"></svg>
    </div>
  </div>
</template>

<style scoped>
.graph-layout {
  display: flex;
  height: 100vh;
}

.graph-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.graph-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 24px 0;
}

.graph-header h2 { margin: 0; }

.graph-stats {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
}

.graph-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  gap: 4px;
}

.filter-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-muted);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  cursor: pointer;
}

.filter-btn:hover { border-color: var(--accent-primary); color: var(--text-primary); }
.filter-btn.active { border-color: var(--accent-primary); color: var(--accent-primary); }

.search-group {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  margin-left: auto;
}

.search-input {
  padding: 5px 10px;
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  width: 180px;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

svg {
  flex: 1;
  width: 100%;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
}
</style>

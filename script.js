/* ─── REFERENCIAS DOM ─────────────────────────────────────── */
const cvs = document.getElementById('cvs');
const ctx = cvs.getContext('2d');
const hint = document.getElementById('hint');
const statusTxt = document.getElementById('statusTxt');
const resultsBox = document.getElementById('resultsBox');
const selInicio = document.getElementById('selInicio');
const selFinal = document.getElementById('selFinal');
const contextMenu = document.getElementById('contextMenu');
const contextMenuTitle = document.getElementById('contextMenuTitle');
const panelResults = document.getElementById('panelResults');
const btnShowPanel = document.getElementById('btnShowPanel');
const resizeHandle = document.getElementById('resizeHandle');
const mainGrid = document.querySelector('.main');

/* ─── ESTADO GLOBAL ───────────────────────────────────────── */
let nodes = [], edges = [], nextId = 1;
let freeIds = []; // IDs reutilizables
let mode = 'nodo';
let selectedId = null, edgePick = [];
let highlightEdges = new Set(), highlightNodes = new Set();
let algoActivo = 'dijkstra';
let editEdge = null;
let contextNodeId = null; // Nodo del menú contextual

const R = 22; 
const INF = 1e15;

/* ─── VARIABLES DE ZOOM Y PAN ────────────────────────────── */
let scale = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let dragId = null;

/* ─── VARIABLES DE REDIMENSIÓN ───────────────────────────── */
let isResizing = false;
let panelWidth = 380;
const MIN_PANEL = 250;
const MAX_PANEL = 700;

/* ─── INICIALIZACIÓN ─────────────────────────────────────── */
function resize() {
  cvs.width = cvs.parentElement.clientWidth;
  cvs.height = cvs.parentElement.clientHeight;
  render();
}
window.addEventListener('resize', resize);
setTimeout(resize, 50);

/* ─── UTILIDADES ─────────────────────────────────────────── */
function toGraphCoords(clientX, clientY) {
  const rect = cvs.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;
  return {
    x: (screenX - panX) / scale,
    y: (screenY - panY) / scale
  };
}

function setStatus(t) { statusTxt.textContent = t; }
function findNode(id) { return nodes.find(n => n.id === id); }
function key(a, b) { return a + '-' + b; }

function hitNode(gx, gy) {
  for (const n of nodes) {
    if (Math.hypot(gx - n.x, gy - n.y) <= R) return n;
  }
  return null;
}

function hitEdge(gx, gy) {
  for (const e of edges) {
    const n1 = findNode(e.from), n2 = findNode(e.to);
    if (!n1 || !n2) continue;
    const dx = n2.x - n1.x, dy = n2.y - n1.y, len = Math.hypot(dx, dy);
    if (!len) continue;
    const t = Math.max(0, Math.min(1, ((gx - n1.x) * dx + (gy - n1.y) * dy) / (len * len)));
    const px = n1.x + t * dx, py = n1.y + t * dy;
    if (Math.hypot(gx - px, gy - py) < 10 / scale) return e;
  }
  return null;
}

/* ─── GESTIÓN DE IDs REUTILIZABLES ───────────────────────── */
function getNextId() {
  if (freeIds.length > 0) {
    return freeIds.shift(); // Toma el menor disponible
  }
  return nextId++;
}

function releaseId(id) {
  freeIds.push(id);
  freeIds.sort((a, b) => a - b); // Mantiene orden ascendente
}

/* ─── ZOOM CONTROLS ──────────────────────────────────────── */
function zoomIn() { scale *= 1.15; render(); }
function zoomOut() { scale /= 1.15; render(); }
function resetZoom() { scale = 1.0; panX = 0; panY = 0; render(); }

cvs.addEventListener('wheel', e => {
  e.preventDefault();
  const mousePos = toGraphCoords(e.clientX, e.clientY);
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  if (scale * zoomFactor < 0.2 || scale * zoomFactor > 5) return;
  scale *= zoomFactor;
  const rect = cvs.getBoundingClientRect();
  panX = (e.clientX - rect.left) - mousePos.x * scale;
  panY = (e.clientY - rect.top) - mousePos.y * scale;
  render();
}, { passive: false });

/* ─── REDIMENSIÓN DEL PANEL ──────────────────────────────── */
resizeHandle.addEventListener('mousedown', e => {
  isResizing = true;
  resizeHandle.classList.add('active');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

window.addEventListener('mousemove', e => {
  if (!isResizing) return;
  const mainRect = mainGrid.getBoundingClientRect();
  const newWidth = mainRect.right - e.clientX;
  if (newWidth >= MIN_PANEL && newWidth <= MAX_PANEL) {
    panelWidth = newWidth;
    updateGridLayout();
  }
});

window.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    resizeHandle.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    resize();
  }
});

function updateGridLayout() {
  const panelVisible = !panelResults.classList.contains('hidden');
  if (panelVisible) {
    mainGrid.style.gridTemplateColumns = `360px 1fr 6px ${panelWidth}px`;
  } else {
    mainGrid.style.gridTemplateColumns = `360px 1fr`;
  }
}

/* ─── MOSTRAR / OCULTAR PANEL ────────────────────────────── */
function togglePanel(show) {
  if (show) {
    panelResults.classList.remove('hidden');
    btnShowPanel.classList.remove('visible');
  } else {
    panelResults.classList.add('hidden');
    btnShowPanel.classList.add('visible');
  }
  updateGridLayout();
  setTimeout(resize, 50);
}

/* ─── MENÚ CONTEXTUAL ────────────────────────────────────── */
function abrirContextMenu(nodeId, clientX, clientY) {
  contextNodeId = nodeId;
  contextMenuTitle.textContent = `Nodo ${nodeId}`;
  
  // Posicionar el menú
  contextMenu.style.left = clientX + 'px';
  contextMenu.style.top = clientY + 'px';
  contextMenu.classList.add('open');
  
  // Ajustar si se sale de la pantalla
  setTimeout(() => {
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = (clientX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = (clientY - rect.height) + 'px';
    }
  }, 0);
}

function cerrarContextMenu() {
  contextMenu.classList.remove('open');
  contextNodeId = null;
}

function confirmarEliminarNodo() {
  if (contextNodeId === null) return;
  const id = contextNodeId;
  cerrarContextMenu();
  
  if (!confirm(`¿Deseas eliminar el Nodo ${id}?`)) return;
  
  nodes = nodes.filter(n => n.id !== id);
  edges = edges.filter(e => e.from !== id && e.to !== id);
  releaseId(id); // Liberar el ID para reutilización
  
  highlightEdges.clear(); highlightNodes.clear();
  selectedId = null; edgePick = [];
  if (!nodes.length) hint.style.display = 'block';
  refreshCombos(); render();
  setStatus(`Nodo ${id} eliminado. Su ID estará disponible para el próximo nodo.`);
}

// Cerrar menú contextual al hacer click fuera
document.addEventListener('click', e => {
  if (!contextMenu.contains(e.target)) {
    cerrarContextMenu();
  }
});

/* ─── MODOS & INTERFAZ ───────────────────────────────────── */
function setModo(m) {
  mode = m;
  document.getElementById('btnModoNodo').classList.toggle('active', m === 'nodo');
  document.getElementById('btnModoArco').classList.toggle('active', m === 'arco');
  edgePick = []; selectedId = null;
  setStatus(m === 'nodo' ? 'Modo: Agregar o mover nodos.' : 'Modo: Arcos. Presiona el Origen y luego el Destino.');
}

function setAlgo(a) {
  algoActivo = a;
  document.getElementById('tabDijk').classList.toggle('active', a === 'dijkstra');
  document.getElementById('tabFW').classList.toggle('active', a === 'floyd');
  setStatus(a === 'dijkstra' 
    ? 'Algoritmo: Dijkstra (no admite pesos negativos).' 
    : 'Algoritmo: Floyd-Warshall (admite pesos negativos).');
}

function refreshCombos() {
  const a = selInicio.value, b = selFinal.value;
  selInicio.innerHTML = '<option value="">—</option>';
  selFinal.innerHTML  = '<option value="">—</option>';
  [...nodes].sort((x, y) => x.id - y.id).forEach(n => {
    const o1 = document.createElement('option');
    o1.value = n.id; o1.textContent = 'Nodo ' + n.id;
    selInicio.appendChild(o1);
    selFinal.appendChild(o1.cloneNode(true));
  });
  if ([...selInicio.options].some(o => o.value == a)) selInicio.value = a;
  if ([...selFinal.options].some(o => o.value == b))  selFinal.value  = b;
}

/* ─── VALIDACIÓN DE PESOS NEGATIVOS ──────────────────────── */
function validarPesoNegativo(w) {
  if (w < 0 && algoActivo === 'dijkstra') {
    alert('⚠️ Dijkstra NO admite pesos negativos.\n\n' +
          'Por teoría, Dijkstra asume que al visitar un nodo ya se encontró el camino óptimo, ' +
          'lo cual es falso con pesos negativos.\n\n' +
          'Si necesitas pesos negativos, cambia al algoritmo Floyd-Warshall.');
    return false;
  }
  return true;
}

/* ─── OPERACIONES DE GRAFOS ──────────────────────────────── */
function addNode(gx, gy) {
  const id = getNextId();
  nodes.push({ id, x: gx, y: gy });
  hint.style.display = 'none';
  refreshCombos(); render();
  setStatus(`Nodo ${id} creado.`);
}

function eliminarNodo() {
  const id = parseInt(document.getElementById('inpEliminar').value);
  if (!id || !findNode(id)) return alert('El ID ingresado no existe.');
  
  nodes = nodes.filter(n => n.id !== id);
  edges = edges.filter(e => e.from !== id && e.to !== id);
  releaseId(id); // Liberar el ID
  
  highlightEdges.clear(); highlightNodes.clear();
  selectedId = null; edgePick = [];
  if (!nodes.length) hint.style.display = 'block';
  refreshCombos(); render();
  document.getElementById('inpEliminar').value = '';
  setStatus(`Nodo ${id} eliminado. Su ID estará disponible para el próximo nodo.`);
}

function agregarArco(from, to, w) {
  if (from === to) return alert('No se permiten lazos reflexivos (mismo origen y fin).');
  if (!findNode(from) || !findNode(to)) return alert('Nodos no encontrados.');
  if (!validarPesoNegativo(w)) return false;
  
  const ex = edges.find(e => e.from === from && e.to === to);
  if (ex) ex.weight = w; else edges.push({ from, to, weight: w });
  
  render();
  return true;
}

function agregarArcoManual() {
  const from = parseInt(document.getElementById('inpOrigen').value);
  const to = parseInt(document.getElementById('inpDestino').value);
  const w = parseFloat(document.getElementById('inpPeso').value);
  if (!from || !to || isNaN(w)) return alert('Por favor, completa Origen, Destino y Peso.');
  if (agregarArco(from, to, w)) {
    document.getElementById('inpOrigen').value = '';
    document.getElementById('inpDestino').value = '';
    document.getElementById('inpPeso').value = '';
  }
}

/* ─── MODAL EDICIÓN ─── */
function abrirModal(e) {
  editEdge = e;
  document.getElementById('modalTitle').textContent = `Arista ${e.from} → ${e.to}`;
  document.getElementById('modalPeso').value = e.weight;
  document.getElementById('edgeModal').classList.add('open');
}
function cerrarModal() {
  document.getElementById('edgeModal').classList.remove('open');
  editEdge = null;
}
function confirmarEditar() {
  if (!editEdge) return;
  const nw = parseFloat(document.getElementById('modalPeso').value);
  if (isNaN(nw)) return alert('Peso inválido.');
  if (!validarPesoNegativo(nw)) return;
  const e = edges.find(x => x.from === editEdge.from && x.to === editEdge.to);
  if (e) e.weight = nw;
  cerrarModal(); render();
}
function confirmarEliminar() {
  if (!editEdge) return;
  edges = edges.filter(x => !(x.from === editEdge.from && x.to === editEdge.to));
  cerrarModal(); render();
}

/* ─── CONTROL DE MOUSE ─── */
cvs.addEventListener('contextmenu', e => e.preventDefault());

cvs.addEventListener('mousedown', e => {
  const gCoord = toGraphCoords(e.clientX, e.clientY);
  
  // Click derecho: panning o menú contextual
  if (e.button === 2) {
    const n = hitNode(gCoord.x, gCoord.y);
    if (n) {
      // Click derecho sobre un nodo → menú contextual
      abrirContextMenu(n.id, e.clientX, e.clientY);
    } else {
      // Click derecho en vacío → panning
      isPanning = true;
      startPanX = e.clientX - panX;
      startPanY = e.clientY - panY;
      cvs.style.cursor = 'grab';
    }
    return;
  }
  
  // Click izquierdo
  if (e.button === 0) {
    const n = hitNode(gCoord.x, gCoord.y);
    if (mode === 'nodo' && n) {
      dragId = n.id; selectedId = n.id; render(); return;
    }
    if (mode === 'arco' && n) {
      edgePick.push(n.id);
      if (edgePick.length === 1) {
        selectedId = n.id; setStatus(`Origen seleccionado: Nodo ${n.id}. Elija el destino.`); render();
      } else {
        const a = edgePick[0], b = edgePick[1];
        const w = prompt(`Peso de la arista (${a} → ${b}):`, '1');
        if (w !== null) {
          const pw = parseFloat(w);
          if (!isNaN(pw)) agregarArco(a, b, pw);
        }
        edgePick = []; selectedId = null; render();
      }
      return;
    }
    if (!n) {
      const edge = hitEdge(gCoord.x, gCoord.y);
      if (edge) { abrirModal(edge); return; }
    }
  }
});

cvs.addEventListener('mousemove', e => {
  if (isPanning) {
    panX = e.clientX - startPanX; panY = e.clientY - startPanY; render(); return;
  }
  if (dragId !== null) {
    const gCoord = toGraphCoords(e.clientX, e.clientY);
    const n = findNode(dragId);
    if (n) { n.x = gCoord.x; n.y = gCoord.y; render(); }
  }
});

window.addEventListener('mouseup', e => {
  if (e.button === 2) { isPanning = false; cvs.style.cursor = 'crosshair'; }
  dragId = null;
});

cvs.addEventListener('click', e => {
  if (mode !== 'nodo' || e.button !== 0) return;
  const gCoord = toGraphCoords(e.clientX, e.clientY);
  if (hitNode(gCoord.x, gCoord.y) || hitEdge(gCoord.x, gCoord.y)) return;
  addNode(gCoord.x, gCoord.y);
});

/* ─── ALGORITMOS ──────────────────────────────────────────── */
function allPaths(start, target) {
  const adj = {};
  nodes.forEach(n => adj[n.id] = []);
  edges.forEach(e => { if (adj[e.from]) adj[e.from].push({ to: e.to, w: e.weight }); });
  const results = []; const visited = new Set();
  function dfs(u, path, cost) {
    if (u === target) { results.push({ path: [...path], cost }); return; }
    visited.add(u);
    for (const { to, w } of adj[u] || []) {
      if (!visited.has(to)) { path.push(to); dfs(to, path, cost + w); path.pop(); }
    }
    visited.delete(u);
  }
  dfs(start, [start], 0); return results;
}

function dijkstra(s, t) {
  const dist = {}, prev = {}, vis = new Set();
  nodes.forEach(n => { dist[n.id] = INF; prev[n.id] = null; });
  dist[s] = 0;
  while (vis.size < nodes.length) {
    let u = null, min = INF;
    nodes.forEach(n => { if (!vis.has(n.id) && dist[n.id] < min) { min = dist[n.id]; u = n.id; } });
    if (u === null) break; vis.add(u);
    edges.filter(e => e.from === u && !vis.has(e.to)).forEach(e => {
      const alt = dist[u] + e.weight;
      if (alt < dist[e.to]) { dist[e.to] = alt; prev[e.to] = u; }
    });
  }
  if (dist[t] === INF) return null;
  const path = []; let cur = t;
  while (cur !== null) { path.unshift(cur); cur = prev[cur]; }
  return { path, cost: dist[t] };
}

function floydWarshall(s, t) {
  const ids = nodes.map(n => n.id); const n = ids.length; const idx = {};
  ids.forEach((id, i) => idx[id] = i);
  const dist = Array.from({ length: n }, () => Array(n).fill(INF));
  const next = Array.from({ length: n }, () => Array(n).fill(null));
  ids.forEach((id, i) => dist[i][i] = 0);
  edges.forEach(e => {
    const i = idx[e.from], j = idx[e.to];
    if (i !== undefined && j !== undefined && e.weight < dist[i][j]) { dist[i][j] = e.weight; next[i][j] = idx[e.to]; }
  });
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (dist[i][k] + dist[k][j] < dist[i][j]) { dist[i][j] = dist[i][k] + dist[k][j]; next[i][j] = next[i][k]; }
  const si = idx[s], ti = idx[t];
  if (dist[si][ti] === INF) return null;
  const path = [s]; let cur = si;
  while (cur !== ti) { cur = next[cur][ti]; if (cur === null) return null; path.push(ids[cur]); }
  return { path, cost: dist[si][ti] };
}

function calcular() {
  const s = parseInt(selInicio.value), t = parseInt(selFinal.value);
  if (!s || !t) return alert('Selecciona los nodos válidos de Inicio y Fin.');
  if (s === t) return alert('El nodo de inicio y final no pueden ser el mismo.');

  const tieneNegativos = edges.some(e => e.weight < 0);
  if (tieneNegativos && algoActivo === 'dijkstra') {
    alert('⚠️ El grafo contiene aristas con pesos negativos.\n\n' +
          'Dijkstra NO puede procesarlas correctamente.\n\n' +
          'Cambia al algoritmo Floyd-Warshall o elimina/modifica las aristas negativas.');
    return;
  }

  highlightEdges.clear(); highlightNodes.clear();

  const res = algoActivo === 'dijkstra' ? dijkstra(s, t) : floydWarshall(s, t);
  const label = algoActivo === 'dijkstra' ? 'Dijkstra' : 'Floyd-Warshall';

  // Mostrar el panel automáticamente al calcular
  if (panelResults.classList.contains('hidden')) {
    togglePanel(true);
  }

  if (!res) {
    resultsBox.innerHTML = `<span style="color:#dc2626; font-weight:800;">✘ [${label}] No se encontró ruta factible entre el Nodo ${s} y el Nodo ${t}.</span>`;
    render(); return;
  }

  highlightNodes.add(s); highlightNodes.add(t);
  for (let i = 0; i < res.path.length - 1; i++) {
    highlightEdges.add(key(res.path[i], res.path[i + 1]));
    highlightNodes.add(res.path[i + 1]);
  }

  const todos = allPaths(s, t).sort((a,b) => a.cost - b.cost);

  let txt = `<span style="color:#2563eb; font-weight:800;">▼ MÉTODO: ${label.toUpperCase()}</span>\n`;
  txt += `────────────────────────────────────────\n`;
  txt += `<span style="color:#16a34a; font-weight:800;">✔ CAMINO ÓPTIMO:</span>\n`;
  txt += `   Ruta: <span style="color:#d97706; font-weight:800">${res.path.join(' → ')}</span>\n`;
  txt += `   Costo: <span style="color:#d97706; font-weight:800">${res.cost}</span>\n\n`;
  txt += `<span style="color:#64748b; font-weight:700;">▼ ALTERNATIVAS:</span>\n`;
  
  todos.forEach((p, idx) => {
    const esOptimo = p.path.join('-') === res.path.join('-');
    const colorC = esOptimo ? '#16a34a' : '#475569';
    const pesoFont = esOptimo ? 'font-weight:800;' : '';
    txt += `   [${idx + 1}] Costo: ${p.cost} | <span style="color:${colorC}; ${pesoFont}">${p.path.join(' → ')}</span>` +
           `${esOptimo ? '  <span style="color:#16a34a; font-weight:800;">★ Óptimo</span>' : ''}\n`;
  });

  resultsBox.innerHTML = txt;
  render();
}

function limpiar() {
  if (!confirm('¿Seguro que deseas purgar todo el grafo activo?')) return;
  nodes = []; edges = []; nextId = 1; freeIds = [];
  selectedId = null; edgePick = [];
  highlightEdges.clear(); highlightNodes.clear();
  refreshCombos(); hint.style.display = 'block'; resetZoom();
  resultsBox.textContent = 'Lienzo limpio. Listo para reconfigurar un nuevo set de datos.';
  setStatus('Grafo limpiado completamente.');
}

/* ─── CANVAS DRAWING SYSTEM ──────────────────────────────── */
function drawGrid() {
  ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
  const step = 40;
  const startX = Math.floor((-panX) / scale / step) * step;
  const endX = startX + cvs.width / scale + step;
  const startY = Math.floor((-panY) / scale / step) * step;
  const endY = startY + cvs.height / scale + step;
  for (let x = startX; x <= endX; x += step) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
  for (let y = startY; y <= endY; y += step) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }
}

function drawEdge(e) {
  const n1 = findNode(e.from), n2 = findNode(e.to);
  if (!n1 || !n2) return;
  const hl = highlightEdges.has(key(e.from, e.to));
  const color = hl ? '#dc2626' : '#64748b';
  const lw = hl ? 4 : 2;

  const dx = n2.x - n1.x, dy = n2.y - n1.y, len = Math.hypot(dx, dy);
  if (!len) return;
  const ux = dx / len, uy = dy / len;
  const sx = n1.x + ux * R, sy = n1.y + uy * R;
  const ex = n2.x - ux * (R + 8), ey = n2.y - uy * (R + 8);

  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();

  // Flecha (siempre dirigido)
  const ang = Math.atan2(ey - sy, ex - sx), al = 12, aa = 0.35;
  ctx.beginPath(); ctx.moveTo(ex, ey);
  ctx.lineTo(ex - al * Math.cos(ang - aa), ey - al * Math.sin(ang - aa));
  ctx.lineTo(ex - al * Math.cos(ang + aa), ey - al * Math.sin(ang + aa));
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();

  const mx = (sx + ex) / 2, my = (sy + ey) / 2;
  ctx.font = 'bold 12px Inter, sans-serif';
  const tw = ctx.measureText(e.weight).width;
  ctx.fillStyle = hl ? '#fee2e2' : '#ffffff';
  ctx.fillRect(mx - (tw+8)/2, my - 9, tw + 8, 18);
  ctx.strokeStyle = hl ? '#fca5a5' : '#cbd5e1';
  ctx.lineWidth = 1; ctx.strokeRect(mx - (tw+8)/2, my - 9, tw + 8, 18);
  ctx.fillStyle = hl ? '#991b1b' : '#1e293b';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e.weight, mx, my);
}

function drawNode(n) {
  const inSel = n.id === selectedId;
  const inPath = highlightNodes.has(n.id);
  const isS = n.id === parseInt(selInicio.value);
  const isT = n.id === parseInt(selFinal.value);

  const color = isS ? '#16a34a' : isT ? '#f59e0b' : inSel ? '#8b5cf6' : inPath ? '#dc2626' : '#2563eb';

  ctx.beginPath(); ctx.arc(n.x, n.y, R, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();

  ctx.fillStyle = '#ffffff'; ctx.font = '800 14px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(n.id, n.x, n.y);
}

function render() {
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(scale, scale);
  drawGrid();
  edges.forEach(drawEdge);
  nodes.forEach(drawNode);
  ctx.restore();
}

// Inicializar layout
updateGridLayout();
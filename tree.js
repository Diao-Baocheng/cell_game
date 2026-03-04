// --- Game State & Data ---
let totalLingShi = 0;
let nodeIdCounter = 1;

// Define Sect Names for randomization
const firstNames = ["无极", "太虚", "星辰", "玄元", "紫胤", "青云", "破虚", "红尘", "九幽", "凌云"];
const lastNames = ["子", "老祖", "真人", "散人", "剑仙", "魔尊", "道士", "狂客", "仙子", "真君"];
const aptitudeLevels = ["凡", "灵", "灵", "道", "神"];

function generateName() {
    let first = firstNames[Math.floor(Math.random() * firstNames.length)];
    let last = lastNames[Math.floor(Math.random() * lastNames.length)];
    return first + last;
}

// Node Data Structure
class Cultivator {
    constructor(name, isRoot = false) {
        this.id = `node_${nodeIdCounter++} `;
        this.name = name || generateName();
        // 资质（凡/灵/道/神）
        this.aptitudeString = isRoot ? "神" : aptitudeLevels[Math.floor(Math.random() * aptitudeLevels.length)];

        let multiplier = 1;
        if (this.aptitudeString === "灵") multiplier = 2;
        if (this.aptitudeString === "道") multiplier = 5;
        if (this.aptitudeString === "神") multiplier = 10;

        // 灵石产量
        this.production = multiplier;
        this.children = [];
    }
}

// Initial Root Data
let rootData = new Cultivator("我 (宗主)", true);

// --- D3 Setup ---
const margin = { top: 40, right: 90, bottom: 50, left: 90 };
let width = window.innerWidth;
let height = window.innerHeight;

// Create zoom behavior
const zoom = d3.zoom()
    .scaleExtent([0.1, 3])
    .on("zoom", (event) => {
        gLocation.attr("transform", event.transform);
    });

const svg = d3.select("#tree-container").append("svg")
    .attr("width", width)
    .attr("height", height)
    .call(zoom);

const gLocation = svg.append("g")
    .attr("transform", `translate(${width / 2}, ${margin.top})`); // Start centered at top

// Let the root node start slightly zoomed out if needed, but 1 is fine
svg.call(zoom.translateTo, 0, 0);
svg.call(zoom.scaleTo, 1);
svg.transition().duration(750).call(
    zoom.transform,
    d3.zoomIdentity.translate(width / 2, margin.top).scale(1)
);

let treeLayout = d3.tree().nodeSize([120, 150]); // Width, Height spacing

let root; // D3 Hierarchy node

// Filter for glow effect
const defs = svg.append("defs");
const filter = defs.append("filter")
    .attr("id", "glow");
filter.append("feGaussianBlur")
    .attr("stdDeviation", "3")
    .attr("result", "coloredBlur");
const feMerge = filter.append("feMerge");
feMerge.append("feMergeNode").attr("in", "coloredBlur");
feMerge.append("feMergeNode").attr("in", "SourceGraphic");

// --- Render Loop ---
function updateD3(source) {
    // 1. Assigns the x and y position for the nodes
    root = d3.hierarchy(rootData, d => d.children);
    treeLayout(root);

    // Nodes
    const nodes = root.descendants();
    // Links
    const links = root.links();

    // ****************** Nodes section ***************************
    // Update the nodes...
    const node = gLocation.selectAll('g.node')
        .data(nodes, d => d.data.id || (d.data.id = `node_${nodeIdCounter++} `));

    // Enter any new nodes at the parent's previous position.
    const nodeEnter = node.enter().append('g')
        .attr('class', 'node')
        .attr('transform', d => {
            // If expanding from a click, start at parent, otherwise calculate normally
            let srcX = source ? (source.x0 || width / 2) : d.x;
            let srcY = source ? (source.y0 || margin.top) : d.y;
            return `translate(${srcX}, ${srcY})`;
        })
        .on('click', clickNode);

    // Add Circle for the nodes
    nodeEnter.append('circle')
        .attr('r', 1e-6)
        .style("filter", "url(#glow)");

    // Add labels for the nodes
    nodeEnter.append('text')
        .attr('dy', '.35em')
        .attr('class', 'name')
        .attr('y', d => d.children || d._children ? -24 : 24)
        .attr('text-anchor', 'middle')
        .text(d => d.data.name);

    nodeEnter.append('text')
        .attr('dy', '.35em')
        .attr('class', 'stats')
        .attr('y', d => d.children || d._children ? -10 : 38)
        .attr('text-anchor', 'middle')
        .text(d => `[${d.data.aptitudeString}阶]产:${d.data.production}/s`);

    // UPDATE
    const nodeUpdate = nodeEnter.merge(node);

    // Transition to the proper position for the node
    nodeUpdate.transition()
        .duration(500)
        .attr('transform', d => `translate(${d.x},${d.y})`);

    // Update the node attributes and style
    nodeUpdate.select('circle')
        .attr('r', 15)
        .style('fill', d => d._children ? "#58a6ff" : "#0d1117") // Highlight collapsed nodes
        .attr('cursor', 'pointer');

    nodeUpdate.select(".stats")
        .attr('y', d => d._children && d.depth !== 0 ? -10 : 38);
    nodeUpdate.select(".name")
        .attr('y', d => d._children && d.depth !== 0 ? -24 : 24);

    // ****************** links section ***************************
    // Update the links...
    const link = gLocation.selectAll('path.link')
        .data(links, d => d.target.data.id);

    // Enter any new links at the parent's previous position.
    const linkEnter = link.enter().insert('path', "g")
        .attr('class', 'link glow') // Add glow to new links
        .attr('d', d => {
            let srcX = source ? (source.x0 || width / 2) : d.source.x;
            let srcY = source ? (source.y0 || margin.top) : d.source.y;
            const o = { x: srcX, y: srcY };
            return diagonal(o, o);
        });

    // UPDATE
    const linkUpdate = linkEnter.merge(link);

    // Transition back to the parent element coordinate
    linkUpdate.transition()
        .duration(500)
        .attr('d', d => diagonal(d.source, d.target));

    // Remove glow after transition for a "flow" effect
    setTimeout(() => {
        linkUpdate.classed('glow', false);
    }, 500);

    // Store the old positions for transition.
    nodes.forEach(d => {
        d.x0 = d.x;
        d.y0 = d.y;
    });

    // Compute Total Production from all rendered nodes (or from hierarchical data)
    updateTotalProductionRate(nodes);
}

// Setup diagonal path generator (Vertical Orientation)
function diagonal(s, d) {
    return `M ${s.x} ${s.y}
            C ${s.x} ${(s.y + d.y) / 2},
              ${d.x} ${(s.y + d.y) / 2},
              ${d.x} ${d.y}`;
}

// Toggle children on click.
function clickNode(event, d) {
    if (d.children) {
        // Collapse (hide children into _children)
        d._children = d.children;
        d.children = null;
    } else {
        if (d._children) {
            // Expand previously collapsed
            d.children = d._children;
            d._children = null;
        } else {
            // Generate new disciples (1 to 3)
            let numNew = Math.floor(Math.random() * 3) + 1;
            if (!d.data.children) d.data.children = [];
            for (let i = 0; i < numNew; i++) {
                d.data.children.push(new Cultivator());
            }
            d.children = d.data.children; // Required to trigger layout update for these nested elements normally, but we are re-parsing from root.
        }
    }
    updateD3(d);
}

// --- Resource Loop ---
let currentProductionRate = 0;
const totalLingShiEl = document.getElementById('total-lingshi');

function updateTotalProductionRate(nodes) {
    currentProductionRate = 0;
    nodes.forEach(n => {
        currentProductionRate += n.data.production;
    });
}

// Initial draw
updateD3();

// Game Loop: Add resources every second
setInterval(() => {
    totalLingShi += currentProductionRate;
    totalLingShiEl.innerText = `${totalLingShi} (+${currentProductionRate}/s)`;

    // Slight flash effect on the text
    totalLingShiEl.style.color = '#fff';
    totalLingShiEl.style.textShadow = '0 0 10px #fff';
    setTimeout(() => {
        totalLingShiEl.style.color = '#3fb950';
        totalLingShiEl.style.textShadow = '0 0 5px rgba(63, 185, 80, 0.5)';
    }, 200);

}, 1000);

// Handle window resize
window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    svg.attr("width", width).attr("height", height);
});

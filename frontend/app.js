/* =====================================================================
   AetherMind Frontend Application Logic Overhaul
   ===================================================================== */

// State variables
let currentSteps = {};
let selectedNodeId = null;
let currentSessionId = null;
let isDarkTheme = false;
let eventSource = null;
let startTime = null;
let telemetryTimer = null;

// Template definition dictionary
const TEMPLATES = {
    puzzle: "Three people (Alice, Bob, and Charlie) are in a room. One of them always tells the truth, one always lies, and one can either lie or tell the truth. Alice says: 'I am the truth-teller.' Bob says: 'Alice is the liar.' Charlie says: 'Bob is the liar.' Who is who?",
    math: "A fair 6-sided die is rolled until a 6 appears. What is the expected number of rolls, and what is the probability that it takes more than 10 rolls? Show the full step-by-step mathematical reasoning.",
    code: "Optimize this Python function that checks if a list has duplicates. Current implementation: \n\n```python\ndef has_duplicates(lst):\n    for i in range(len(lst)):\n        for j in range(i + 1, len(lst)):\n            if lst[i] == lst[j]:\n                return True\n    return False\n```\n\nDiscuss performance characteristics (time and space complexity) of the current method vs a HashSet approach and write the optimal version.",
    business: "A SaaS company has 5,000 customers paying $20/month. They are considering raising the price to $25/month. If 15% of the customers churn due to the price increase, what is the net impact on monthly recurring revenue (MRR) and annual recurring revenue (ARR)? Explain the tradeoffs and suggest a mitigation strategy."
};

// Node coordinate mapping (percentage coordinates x, y)
const TOPOLOGY_COORDINATES = {
    cot: {
        deconstruct: { x: 50, y: 15 },
        thinking: { x: 50, y: 50 },
        synthesis: { x: 50, y: 85 }
    },
    debate: {
        deconstruct: { x: 50, y: 12 },
        proposal: { x: 50, y: 31 },
        critique: { x: 50, y: 50 },
        revision: { x: 50, y: 69 },
        synthesis: { x: 50, y: 88 }
    },
    tot: {
        deconstruct: { x: 50, y: 12 },
        path_a: { x: 20, y: 35 },
        path_b: { x: 50, y: 35 },
        path_c: { x: 80, y: 35 },
        evaluation: { x: 50, y: 60 },
        expansion: { x: 50, y: 78 },
        synthesis: { x: 50, y: 92 }
    }
};

// Friendly Lucide Icon mappings for agent steps
function getIconName(id) {
    const icons = {
        deconstruct: "split",
        thinking: "git-commit",
        proposal: "file-edit",
        critique: "shield-alert",
        revision: "rotate-cw",
        path_a: "trending-up",
        path_b: "cpu",
        path_c: "zap",
        evaluation: "bar-chart-2",
        expansion: "git-branch",
        synthesis: "award"
    };
    return icons[id] || "help-circle";
}

// =====================================================================
// Dom Elements
// =====================================================================
document.addEventListener("DOMContentLoaded", () => {
    // Configs
    const apiKeyInput = document.getElementById("apiKey");
    const toggleApiKeyBtn = document.getElementById("toggleApiKey");
    const modelSelect = document.getElementById("modelSelect");
    const topologySelect = document.getElementById("topologySelect");
    
    // Inputs & Control
    const templateSelect = document.getElementById("templateSelect");
    const problemInput = document.getElementById("problemInput");
    const runBtn = document.getElementById("runBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    
    // Status & Output panels
    const vizStatus = document.getElementById("vizStatus");
    const solutionContent = document.getElementById("solutionContent");
    const copySolutionBtn = document.getElementById("copySolutionBtn");
    const detailsContent = document.getElementById("nodeDetailsContent");
    const themeToggle = document.getElementById("themeToggle");
    const sessionHistory = document.getElementById("sessionHistory");
    
    // Telemetry DOM elements
    const statNodes = document.getElementById("statNodes");
    const statTime = document.getElementById("statTime");
    const statSpeed = document.getElementById("statSpeed");

    // Tab buttons & Panes
    const tabBtns = document.querySelectorAll(".workspace-tabs .tab-btn");
    const tabPanes = document.querySelectorAll(".workspace-content .tab-pane");

    // =====================================================================
    // Initialization & Event Listeners
    // =====================================================================
    
    // Load config from localStorage
    if (localStorage.getItem("aether_api_key")) {
        apiKeyInput.value = localStorage.getItem("aether_api_key");
    }
    if (localStorage.getItem("aether_model")) {
        modelSelect.value = localStorage.getItem("aether_model");
    }
    if (localStorage.getItem("aether_topology")) {
        topologySelect.value = localStorage.getItem("aether_topology");
    }

    // Save configurations on change
    apiKeyInput.addEventListener("change", () => localStorage.setItem("aether_api_key", apiKeyInput.value));
    modelSelect.addEventListener("change", () => localStorage.setItem("aether_model", modelSelect.value));
    topologySelect.addEventListener("change", () => {
        localStorage.setItem("aether_topology", topologySelect.value);
        resetGraph();
    });

    // Toggle API Key visibility
    toggleApiKeyBtn.addEventListener("click", () => {
        const type = apiKeyInput.getAttribute("type") === "password" ? "text" : "password";
        apiKeyInput.setAttribute("type", type);
        const iconName = type === "password" ? "eye" : "eye-off";
        toggleApiKeyBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
        lucide.createIcons();
    });

    // Handle template changes
    templateSelect.addEventListener("click", (e) => {
        const val = e.target.value;
        if (TEMPLATES[val]) {
            problemInput.value = TEMPLATES[val];
        }
    });
    // Fallback for option selection changes
    templateSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        if (TEMPLATES[val]) {
            problemInput.value = TEMPLATES[val];
        }
    });

    // Theme Toggle
    themeToggle.addEventListener("click", () => {
        isDarkTheme = !isDarkTheme;
        document.documentElement.setAttribute("data-theme", isDarkTheme ? "dark" : "light");
        themeToggle.innerHTML = `<i data-lucide="${isDarkTheme ? 'sun' : 'moon'}"></i>`;
        lucide.createIcons();
        renderGraph(); // Redraw graph to respect color transitions
    });

    // Copy Solution
    copySolutionBtn.addEventListener("click", () => {
        const rawText = solutionContent.innerText;
        navigator.clipboard.writeText(rawText).then(() => {
            const originalText = copySolutionBtn.innerHTML;
            copySolutionBtn.innerHTML = `<i data-lucide="check"></i> Copied!`;
            lucide.createIcons();
            setTimeout(() => {
                copySolutionBtn.innerHTML = originalText;
                lucide.createIcons();
            }, 2000);
        });
    });

    // Wire up tab switches
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabId = btn.getAttribute("data-tab");
            switchTab(tabId);
        });
    });

    // Run Engine Trigger
    runBtn.addEventListener("click", () => startReasoningProcess());
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => cancelReasoningProcess());
    }

    // Load History sessions
    loadRecentSessions();

    // Initial SVG reset
    resetGraph();
    lucide.createIcons();

    // =====================================================================
    // Main Functions
    // =====================================================================
    
    function switchTab(tabId) {
        tabBtns.forEach(btn => {
            if (btn.getAttribute("data-tab") === tabId) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
        tabPanes.forEach(pane => {
            if (pane.id === `pane-${tabId}`) {
                pane.classList.add("active");
            } else {
                pane.classList.remove("active");
            }
        });
        if (tabId === "flow") {
            renderGraph();
        }
    }
    
    function resetGraph() {
        const topology = topologySelect.value;
        const coords = TOPOLOGY_COORDINATES[topology];
        currentSteps = {};
        selectedNodeId = null;
        
        // Populate currentSteps layout structure with default empty values
        for (const [id, value] of Object.entries(coords)) {
            currentSteps[id] = {
                id: id,
                label: getFriendlyLabel(id),
                status: "idle", // idle, thinking, completed
                output: "",
                duration: 0,
                parent_ids: getParentIds(topology, id)
            };
        }
        
        // Reset telemetry labels
        statNodes.innerText = `0 / ${Object.keys(coords).length}`;
        statTime.innerText = "0.0s";
        statSpeed.innerText = "0 w/s";
        
        renderGraph();
        renderNodeDetails(null);
    }

    function getFriendlyLabel(id) {
        const labels = {
            deconstruct: "Problem Deconstruction",
            thinking: "Logic Chain",
            proposal: "Draft Proposal",
            critique: "Ruthless Critique",
            revision: "Refined Revision",
            path_a: "Branch A: Analytical",
            path_b: "Branch B: Algorithmic",
            path_c: "Branch C: Heuristic",
            evaluation: "Alternative Eval",
            expansion: "Branch Execution",
            synthesis: "Solution Synthesis"
        };
        return labels[id] || id;
    }

    function getParentIds(topology, id) {
        if (topology === "cot") {
            if (id === "thinking") return ["deconstruct"];
            if (id === "synthesis") return ["thinking"];
        } else if (topology === "debate") {
            if (id === "proposal") return ["deconstruct"];
            if (id === "critique") return ["proposal"];
            if (id === "revision") return ["critique"];
            if (id === "synthesis") return ["revision"];
        } else if (topology === "tot") {
            if (id === "path_a" || id === "path_b" || id === "path_c") return ["deconstruct"];
            if (id === "evaluation") return ["path_a", "path_b", "path_c"];
            if (id === "expansion") return ["evaluation"];
            if (id === "synthesis") return ["expansion"];
        }
        return [];
    }

    function updateTelemetry() {
        if (!startTime) return;
        const steps = Object.values(currentSteps);
        
        // Completed count
        const completedCount = steps.filter(s => s.status === "completed").length;
        statNodes.innerText = `${completedCount} / ${steps.length}`;
        
        // Speed (words per second)
        const elapsed = (Date.now() - startTime) / 1000;
        let totalWords = 0;
        steps.forEach(step => {
            if (step.output) {
                totalWords += step.output.trim().split(/\s+/).filter(w => w.length > 0).length;
            }
        });
        
        if (elapsed > 0) {
            const wps = Math.round(totalWords / elapsed);
            statSpeed.innerText = `${wps} w/s`;
        }
    }

    function startReasoningProcess() {
        const problem = problemInput.value.trim();
        const apiKey = apiKeyInput.value.trim();
        const model = modelSelect.value;
        const topology = topologySelect.value;

        if (!problem) {
            alert("Please input a problem description to solve.");
            return;
        }

        // Setup UI State & Tabs
        runBtn.disabled = true;
        runBtn.innerHTML = `<span>Thinking...</span> <i data-lucide="loader" class="animate-spin btn-icon-right"></i>`;
        if (cancelBtn) cancelBtn.classList.remove("hidden");
        lucide.createIcons();
        
        // Reset output markdown block placeholder
        solutionContent.innerHTML = `
            <div class="solution-placeholder">
                <i data-lucide="loader" class="animate-spin placeholder-icon"></i>
                <p>Generating final synthesized solution...</p>
            </div>
        `;
        
        vizStatus.innerText = "Connecting...";
        vizStatus.className = "viz-status active";
        
        resetGraph();
        switchTab("flow"); // Automatically redirect to graph flow view
        
        // Setup Telemetry Running Timer
        startTime = Date.now();
        telemetryTimer = setInterval(() => {
            if (startTime) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                statTime.innerText = `${elapsed}s`;
                updateTelemetry();
            }
        }, 100);

        // Generate a new Session ID
        currentSessionId = "session_" + Date.now();

        // Construct EventSource URL
        const params = new URLSearchParams({
            problem: problem,
            topology: topology,
            api_key: apiKey,
            model: model
        });

        eventSource = new EventSource(`/api/reason?${params.toString()}`);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.event === "step") {
                    const step = data.step;
                    
                    // Update step details in local memory
                    currentSteps[step.id] = {
                        id: step.id,
                        label: step.label,
                        status: step.status,
                        output: step.output,
                        duration: step.duration,
                        parent_ids: step.parent_ids
                    };

                    vizStatus.innerText = `Agent: ${step.label} (${step.status})`;

                    // Auto select thinking node
                    if (step.status === "thinking" || (step.status === "completed" && !selectedNodeId)) {
                        selectedNodeId = step.id;
                    }

                    renderGraph();
                    updateTelemetry();
                    
                    // Render details panel if active
                    if (selectedNodeId === step.id) {
                        renderNodeDetails(step.id);
                    }
                } else if (data.event === "done") {
                    cleanupTelemetry();
                    vizStatus.innerText = "Completed";
                    vizStatus.className = "viz-status completed";
                    eventSource.close();
                    
                    // Render Final synthesized output
                    solutionContent.innerHTML = marked.parse(data.final_output);
                    switchTab("solution"); // Auto swap to final output view

                    // Auto select the synthesis node
                    selectedNodeId = "synthesis";
                    renderGraph();
                    renderNodeDetails("synthesis");

                    // Save session details to backend DB
                    saveSessionToHistory(problem, topology, data.final_output);
                    
                    // Reset UI
                    enableUI();
                } else if (data.event === "error") {
                    cleanupTelemetry();
                    eventSource.close();
                    vizStatus.innerText = "Error encountered";
                    vizStatus.className = "viz-status error";
                    detailsContent.innerHTML = `<div class="details-placeholder"><i data-lucide="alert-triangle" style="color: var(--accent-rose); width: 48px; height: 48px;"></i><p style="color: var(--accent-rose); margin-top: 10px;">Error: ${data.message}</p></div>`;
                    lucide.createIcons();
                    enableUI();
                }
            } catch (err) {
                console.error("Failed to parse event message:", err);
            }
        };

        eventSource.onerror = (err) => {
            console.error("SSE Connection Failed:", err);
            cleanupTelemetry();
            eventSource.close();
            vizStatus.innerText = "Disconnected";
            enableUI();
        };
    }

    function cleanupTelemetry() {
        if (telemetryTimer) {
            clearInterval(telemetryTimer);
            telemetryTimer = null;
        }
    }

    function cancelReasoningProcess() {
        cleanupTelemetry();
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        vizStatus.innerText = "Canceled by User";
        vizStatus.className = "viz-status error";
        
        // Mark thinking steps back to idle
        for (const [id, step] of Object.entries(currentSteps)) {
            if (step.status === "thinking") {
                step.status = "idle";
            }
        }
        
        renderGraph();
        if (selectedNodeId) {
            renderNodeDetails(selectedNodeId);
        }
        enableUI();
    }

    function enableUI() {
        runBtn.disabled = false;
        runBtn.innerHTML = `<span>Execute Reasoning</span> <i data-lucide="play" class="btn-icon-right"></i>`;
        if (cancelBtn) cancelBtn.classList.add("hidden");
        lucide.createIcons();
    }

    // =====================================================================
    // SVG Graph Rendering Core (using HTML nodes inside foreignObject)
    // =====================================================================
    function renderGraph() {
        const svg = document.getElementById("graphSvg");
        const nodesGroup = document.getElementById("nodesGroup");
        const linksGroup = document.getElementById("linksGroup");

        if (!svg || !nodesGroup || !linksGroup) return;

        // Clear existing SVG shapes
        nodesGroup.innerHTML = "";
        linksGroup.innerHTML = "";

        const width = svg.clientWidth || 600;
        const height = svg.clientHeight || 450;
        const topology = topologySelect.value;
        const coords = TOPOLOGY_COORDINATES[topology];

        if (!coords) return;

        // Draw Links/Edges as smooth cubic bezier curves
        for (const [id, step] of Object.entries(currentSteps)) {
            const startCoord = coords[id];
            if (!startCoord) continue;

            const startX = (startCoord.x / 100) * width;
            const startY = (startCoord.y / 100) * height;

            step.parent_ids.forEach(parentId => {
                const parentCoord = coords[parentId];
                if (!parentCoord) return;

                const parentX = (parentCoord.x / 100) * width;
                const parentY = (parentCoord.y / 100) * height;

                // Determine line status
                let linkClass = "svg-edge";
                let markerId = "arrow";
                
                const parent = currentSteps[parentId];
                if (parent && parent.status === "completed") {
                    if (step.status === "thinking") {
                        linkClass += " active";
                        markerId = "arrow-active";
                    } else if (step.status === "completed") {
                        linkClass += " completed";
                        markerId = "arrow-completed";
                    }
                }

                // Draw Bezier curve connection path
                const midY = (parentY + startY) / 2;
                const pathData = `M ${parentX} ${parentY} C ${parentX} ${midY}, ${startX} ${midY}, ${startX} ${startY}`;

                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                path.setAttribute("d", pathData);
                path.setAttribute("class", linkClass);
                path.setAttribute("marker-end", `url(#${markerId})`);
                linksGroup.appendChild(path);
            });
        }

        // Draw Nodes using HTML templates inside foreignObject
        for (const [id, step] of Object.entries(currentSteps)) {
            const coord = coords[id];
            if (!coord) continue;

            const x = (coord.x / 100) * width;
            const y = (coord.y / 100) * height;

            // Dimensions for node rectangular box
            const rectW = 160;
            const rectH = 50;

            // Create Node Group wrapper
            const nodeG = document.createElementNS("http://www.w3.org/2000/svg", "g");
            nodeG.setAttribute("transform", `translate(${x}, ${y})`);
            
            // Build the foreignObject
            const foreignObject = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
            foreignObject.setAttribute("x", -rectW / 2);
            foreignObject.setAttribute("y", -rectH / 2);
            foreignObject.setAttribute("width", rectW);
            foreignObject.setAttribute("height", rectH);
            foreignObject.setAttribute("class", "node-foreign-object");

            // Configure state classes
            let cardClass = `node-card ${step.status}`;
            if (selectedNodeId === id) cardClass += " selected";

            // Format status label
            let statusLabelText = step.status;
            if (step.status === "thinking") {
                statusLabelText = "thinking...";
            } else if (step.status === "completed") {
                statusLabelText = `${step.duration}s`;
            }

            const iconName = getIconName(id);

            const containerDiv = document.createElement("div");
            containerDiv.className = cardClass;
            containerDiv.innerHTML = `
                <div class="node-inner">
                    <div class="node-icon">
                        <i data-lucide="${iconName}"></i>
                    </div>
                    <div class="node-content">
                        <div class="node-label" title="${step.label}">${step.label}</div>
                        <div class="node-status">${statusLabelText}</div>
                    </div>
                </div>
            `;

            // Click interaction inside foreignObject
            containerDiv.addEventListener("click", (e) => {
                e.stopPropagation();
                selectedNodeId = id;
                renderGraph(); // Trigger redrawing to apply selection style
                renderNodeDetails(id);
            });

            foreignObject.appendChild(containerDiv);
            nodeG.appendChild(foreignObject);
            nodesGroup.appendChild(nodeG);
        }

        // Render Lucide icons loaded inside SVG elements
        lucide.createIcons();
    }

    // =====================================================================
    // Node details viewer
    // =====================================================================
    function renderNodeDetails(nodeId) {
        if (!nodeId || !currentSteps[nodeId]) {
            detailsContent.innerHTML = `
                <div class="details-placeholder">
                    <i data-lucide="mouse-pointer-click" class="placeholder-icon"></i>
                    <p>Click any active reasoning node in the graph to view that agent's step-by-step thinking.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        const step = currentSteps[nodeId];
        
        // Calculate performance metrics
        const wordCount = step.output ? step.output.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
        const speed = step.duration > 0 && wordCount > 0 ? (wordCount / step.duration).toFixed(1) : null;
        
        let headerHtml = `
            <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 15px;">
                <h2 style="font-size: 1.15rem; display: flex; align-items: center; gap: 8px;">
                    <span class="status-indicator ${step.status === 'completed' ? 'online' : ''}" style="background-color: ${step.status === 'completed' ? 'var(--accent-emerald)' : 'var(--accent-blue)'}"></span>
                    ${step.label}
                </h2>
                <div style="display: flex; flex-wrap: wrap; gap: 15px; font-size: 0.75rem; color: var(--text-secondary); font-family: var(--font-mono); margin-top: 5px;">
                    <span>STATUS: ${step.status.toUpperCase()}</span>
                    <span>DURATION: ${step.duration}s</span>
                    ${wordCount > 0 ? `<span>WORDS: ${wordCount}</span>` : ''}
                    ${speed ? `<span>SPEED: ${speed} w/s</span>` : ''}
                </div>
            </div>
        `;

        let contentHtml = "";
        if (step.status === "idle") {
            contentHtml = `<p style="color: var(--text-muted); font-style: italic;">This node is currently queued in the pipeline and has not started executing yet.</p>`;
        } else if (step.status === "thinking" && !step.output) {
            contentHtml = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0; color: var(--text-secondary);">
                    <i data-lucide="loader" class="animate-spin placeholder-icon" style="color: var(--accent-blue);"></i>
                    <p style="font-style: italic; font-size: 0.85rem; margin-top: 10px;">Agent is analyzing inputs and formulating logic structure...</p>
                </div>
            `;
        } else {
            // Render markdown content
            contentHtml = marked.parse(step.output);
        }

        detailsContent.innerHTML = headerHtml + contentHtml;
        lucide.createIcons();
    }

    // =====================================================================
    // DB & Local Session History Storage
    // =====================================================================
    function loadRecentSessions() {
        fetch("/api/sessions")
            .then(res => res.json())
            .then(sessions => {
                sessionHistory.innerHTML = "";
                
                if (sessions.length === 0) {
                    sessionHistory.innerHTML = `<div class="empty-history">No past runs in this session.</div>`;
                    return;
                }

                sessions.forEach(session => {
                    const dateStr = new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    const item = document.createElement("div");
                    item.className = "session-item";
                    
                    item.innerHTML = `
                        <div class="session-info">
                            <div class="session-title" title="${session.problem}">${session.problem}</div>
                            <div class="session-meta">
                                <span>${session.topology.toUpperCase()}</span>
                                <span>•</span>
                                <span>${dateStr}</span>
                            </div>
                        </div>
                        <button class="session-delete-btn" title="Delete run"><i data-lucide="trash-2"></i></button>
                    `;

                    // Click session to load it back
                    item.addEventListener("click", (e) => {
                        if (e.target.closest(".session-delete-btn")) return;
                        loadSessionState(session);
                    });

                    // Delete button click
                    const deleteBtn = item.querySelector(".session-delete-btn");
                    deleteBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                    });

                    sessionHistory.appendChild(item);
                });
                
                lucide.createIcons();
            })
            .catch(err => console.error("Failed to load history runs:", err));
    }

    function saveSessionToHistory(problem, topology, finalOutput) {
        const stepsArray = [];
        for (const [id, step] of Object.entries(currentSteps)) {
            stepsArray.push(step);
        }

        const sessionPayload = {
            id: currentSessionId,
            problem: problem,
            topology: topology,
            timestamp: new Date().toISOString(),
            final_output: finalOutput,
            steps: stepsArray
        };

        fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sessionPayload)
        })
        .then(() => loadRecentSessions())
        .catch(err => console.error("Failed to write session history:", err));
    }

    function deleteSession(id) {
        fetch(`/api/sessions/${id}`, {
            method: "DELETE"
        })
        .then(() => loadRecentSessions())
        .catch(err => console.error("Failed to delete history item:", err));
    }

    function loadSessionState(session) {
        currentSessionId = session.id;
        problemInput.value = session.problem;
        topologySelect.value = session.topology;
        localStorage.setItem("aether_topology", session.topology);

        // Populate steps
        currentSteps = {};
        session.steps.forEach(step => {
            currentSteps[step.id] = step;
        });

        // Update visualization status
        vizStatus.innerText = "Loaded from History";
        vizStatus.className = "viz-status";

        // Redraw SVG graph & details
        renderGraph();
        
        // Render Final solution
        solutionContent.innerHTML = marked.parse(session.final_output);
        switchTab("solution");
        
        // Auto select final node
        selectedNodeId = "synthesis";
        renderGraph();
        renderNodeDetails("synthesis");
    }

    // Redraw on window resize
    window.addEventListener("resize", () => {
        renderGraph();
    });
});

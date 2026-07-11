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
let lastAutoScrolledId = null;

// Zoom & Pan state variables
let zoomScale = 1.0;
let zoomTranslateX = 0;
let zoomTranslateY = 0;
let isDraggingGraph = false;
let dragStartX = 0;
let dragStartY = 0;

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
    },
    ensemble: {
        deconstruct: { x: 50, y: 15 },
        agent_a: { x: 20, y: 48 },
        agent_b: { x: 50, y: 48 },
        agent_c: { x: 80, y: 48 },
        synthesis: { x: 50, y: 85 }
    },
    refinement: {
        deconstruct: { x: 50, y: 10 },
        draft: { x: 50, y: 26 },
        critique_1: { x: 30, y: 44 },
        revision_1: { x: 70, y: 58 },
        critique_2: { x: 30, y: 74 },
        synthesis: { x: 50, y: 90 }
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
        synthesis: "award",
        agent_a: "binary",
        agent_b: "cpu",
        agent_c: "sparkles",
        draft: "file-text",
        critique_1: "shield-alert",
        revision_1: "refresh-cw",
        critique_2: "zoom-in"
    };
    return icons[id] || "help-circle";
}

// Map agent node to role class for styling color codes
function getRoleClass(id) {
    if (id === "deconstruct") return "role-deconstruct";
    if (["critique", "critique_1", "critique_2"].includes(id)) return "role-critique";
    if (id === "evaluation") return "role-evaluation";
    if (id === "synthesis") return "role-synthesis";
    return "role-reasoning";
}

// Ordered steps mapping for rendering the chronological timeline view
const TOPOLOGY_ORDER = {
    cot: ["deconstruct", "thinking", "synthesis"],
    debate: ["deconstruct", "proposal", "critique", "revision", "synthesis"],
    tot: ["deconstruct", "path_a", "path_b", "path_c", "evaluation", "expansion", "synthesis"],
    ensemble: ["deconstruct", "agent_a", "agent_b", "agent_c", "synthesis"],
    refinement: ["deconstruct", "draft", "critique_1", "revision_1", "critique_2", "synthesis"]
};


// =====================================================================
// Dom Elements
// =====================================================================
document.addEventListener("DOMContentLoaded", () => {
    // Configs
    const apiKeyInput = document.getElementById("apiKey");
    const toggleApiKeyBtn = document.getElementById("toggleApiKey");
    const modelSelect = document.getElementById("modelSelect");
    const topologySelect = document.getElementById("topologySelect");
    
    // Developer configuration fields
    const tempSlider = document.getElementById("tempSlider");
    const tempValue = document.getElementById("tempValue");
    const customPromptDecon = document.getElementById("customPromptDecon");
    const customPromptLogic = document.getElementById("customPromptLogic");
    const customPromptCritique = document.getElementById("customPromptCritique");
    const customPromptSynth = document.getElementById("customPromptSynth");
    const advSettingsToggle = document.getElementById("advSettingsToggle");
    const advSettingsContent = document.getElementById("advSettingsContent");
    
    // Inputs & Control
    const templateSelect = document.getElementById("templateSelect");
    const problemInput = document.getElementById("problemInput");
    const runBtn = document.getElementById("runBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    
    // Progress Bar Elements
    const progressBarContainer = document.getElementById("progressBarContainer");
    const progressBarFill = document.getElementById("progressBarFill");
    const progressBarStatus = document.getElementById("progressBarStatus");
    
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

    // Export elements
    const exportBtn = document.getElementById("exportBtn");
    const exportDropdown = document.getElementById("exportDropdown");
    const exportMarkdownBtn = document.getElementById("exportMarkdownBtn");
    const exportJsonBtn = document.getElementById("exportJsonBtn");

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
    if (localStorage.getItem("aether_temp")) {
        tempSlider.value = localStorage.getItem("aether_temp");
        tempValue.innerText = tempSlider.value;
    }
    if (localStorage.getItem("aether_prompt_decon")) {
        customPromptDecon.value = localStorage.getItem("aether_prompt_decon");
    }
    if (localStorage.getItem("aether_prompt_logic")) {
        customPromptLogic.value = localStorage.getItem("aether_prompt_logic");
    }
    if (localStorage.getItem("aether_prompt_critique")) {
        customPromptCritique.value = localStorage.getItem("aether_prompt_critique");
    }
    if (localStorage.getItem("aether_prompt_synth")) {
        customPromptSynth.value = localStorage.getItem("aether_prompt_synth");
    }

    // Save configurations on change
    apiKeyInput.addEventListener("change", () => localStorage.setItem("aether_api_key", apiKeyInput.value));
    modelSelect.addEventListener("change", () => localStorage.setItem("aether_model", modelSelect.value));
    topologySelect.addEventListener("change", () => {
        localStorage.setItem("aether_topology", topologySelect.value);
        resetGraph();
    });
    
    tempSlider.addEventListener("input", (e) => {
        tempValue.innerText = e.target.value;
    });
    tempSlider.addEventListener("change", () => localStorage.setItem("aether_temp", tempSlider.value));
    customPromptDecon.addEventListener("change", () => localStorage.setItem("aether_prompt_decon", customPromptDecon.value));
    customPromptLogic.addEventListener("change", () => localStorage.setItem("aether_prompt_logic", customPromptLogic.value));
    customPromptCritique.addEventListener("change", () => localStorage.setItem("aether_prompt_critique", customPromptCritique.value));
    customPromptSynth.addEventListener("change", () => localStorage.setItem("aether_prompt_synth", customPromptSynth.value));

    // Developer Accordion Drawer
    advSettingsToggle.addEventListener("click", () => {
        advSettingsToggle.classList.toggle("active");
        advSettingsContent.classList.toggle("hidden");
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

    // Dropdown visibility for Export
    if (exportBtn && exportDropdown) {
        exportBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            exportDropdown.classList.toggle("hidden");
        });
        document.addEventListener("click", () => {
            exportDropdown.classList.add("hidden");
        });
    }

    exportMarkdownBtn.addEventListener("click", exportMarkdownReport);
    exportJsonBtn.addEventListener("click", exportJsonDataset);

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

    // Initial SVG setup, Zoom handlers and Backdrop
    resetGraph();
    initSvgZoomPan();
    initNeuralBackground();
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
        lastAutoScrolledId = null;
        
        // Hide and reset progress bar
        if (progressBarContainer) {
            progressBarContainer.classList.add("hidden");
            progressBarFill.style.width = "0%";
            progressBarStatus.innerText = "0% Reasoning Completed";
        }
        
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
        
        // Reset SVG transformation matrix
        zoomScale = 1.0;
        zoomTranslateX = 0;
        zoomTranslateY = 0;
        applyZoom();

        renderGraph();
        renderTimeline();
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
            synthesis: "Solution Synthesis",
            agent_a: "Analytical Expert",
            agent_b: "Algorithmic Expert",
            agent_c: "Creative Expert",
            draft: "Initial Proposal",
            critique_1: "Audit Round 1",
            revision_1: "Revision Round 1",
            critique_2: "Audit Round 2"
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
        } else if (topology === "ensemble") {
            if (id === "agent_a" || id === "agent_b" || id === "agent_c") return ["deconstruct"];
            if (id === "synthesis") return ["agent_a", "agent_b", "agent_c"];
        } else if (topology === "refinement") {
            if (id === "draft") return ["deconstruct"];
            if (id === "critique_1") return ["draft"];
            if (id === "revision_1") return ["critique_1"];
            if (id === "critique_2") return ["revision_1"];
            if (id === "synthesis") return ["critique_2"];
        }
        return [];
    }

    function updateProgressBar() {
        if (!progressBarContainer || !progressBarFill || !progressBarStatus) return;
        const steps = Object.values(currentSteps);
        if (steps.length === 0) return;
        
        const completedCount = steps.filter(s => s.status === "completed").length;
        const percentage = (completedCount / steps.length) * 100;
        
        progressBarFill.style.width = `${percentage}%`;
        progressBarStatus.innerText = `${Math.round(percentage)}% Reasoning Completed (${completedCount} of ${steps.length} agents finished)`;
        
        // Show container if running
        if (completedCount > 0 || steps.some(s => s.status === "thinking")) {
            progressBarContainer.classList.remove("hidden");
        }
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

        updateProgressBar();
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

        // Construct EventSource URL with advanced config parameters
        const params = new URLSearchParams({
            problem: problem,
            topology: topology,
            api_key: apiKey,
            model: model,
            temperature: tempSlider.value,
            prompt_decon: customPromptDecon.value.trim(),
            prompt_logic: customPromptLogic.value.trim(),
            prompt_critique: customPromptCritique.value.trim(),
            prompt_synth: customPromptSynth.value.trim()
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
                    
                    // Auto-scroll timeline to active thinking node when its status transitions
                    if (step.status === "thinking" && lastAutoScrolledId !== step.id) {
                        lastAutoScrolledId = step.id;
                        renderTimeline(step.id);
                    } else {
                        renderTimeline();
                    }
                } else if (data.event === "done") {
                    cleanupTelemetry();
                    vizStatus.innerText = "Completed";
                    vizStatus.className = "viz-status completed";
                    eventSource.close();
                    
                    // Render Final synthesized output
                    solutionContent.innerHTML = marked.parse(data.final_output);
                    postProcessMarkdown(solutionContent);
                    switchTab("solution"); // Auto swap to final output view

                    // Auto select the synthesis node
                    selectedNodeId = "synthesis";
                    renderGraph();
                    renderTimeline("synthesis");

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
        renderTimeline();
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
            const roleClass = getRoleClass(id);
            let cardClass = `node-card ${step.status} ${roleClass}`;
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
                renderTimeline(id);
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
    // =====================================================================
    // Chronological step timeline log rendering (Cognitive Console)
    // =====================================================================
    function renderTimeline(focusId = null) {
        const topology = topologySelect.value;
        const order = TOPOLOGY_ORDER[topology];
        if (!order) return;

        let html = '<div class="console-timeline">';
        
        order.forEach(id => {
            const step = currentSteps[id];
            if (!step) return;

            const roleClass = getRoleClass(id);
            const isSelected = selectedNodeId === id;
            
            let cardClass = `timeline-card ${step.status} ${roleClass}`;
            if (isSelected) cardClass += " selected";
            
            // By default, idle cards are collapsed
            const isCollapsed = step.collapsed !== undefined ? step.collapsed : (step.status === "idle");
            if (isCollapsed) cardClass += " collapsed";

            // Status label & metadata
            let statusText = "";
            let metaText = "";
            
            if (step.status === "idle") {
                statusText = "Queued";
            } else if (step.status === "thinking") {
                statusText = "Running...";
                metaText = `<span class="animate-spin" style="display:inline-block;"><i data-lucide="loader" style="width:12px; height:12px;"></i></span>`;
            } else if (step.status === "completed") {
                statusText = "Completed";
                const wordCount = step.output ? step.output.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
                metaText = `<span>${step.duration}s</span><span>•</span><span>${wordCount} words</span>`;
            }

            const iconName = getIconName(id);

            html += `
                <div class="${cardClass}" id="timeline-card-${id}">
                    <div class="timeline-card-header" data-id="${id}">
                        <div class="timeline-card-title-group">
                            <div class="timeline-card-icon">
                                <i data-lucide="${iconName}"></i>
                            </div>
                            <div class="timeline-card-title">${step.label}</div>
                        </div>
                        <div class="timeline-card-meta">
                            <span>${statusText}</span>
                            ${metaText ? `<span>•</span>${metaText}` : ""}
                        </div>
                    </div>
                    <div class="timeline-card-body">
            `;

            if (step.status === "thinking" && !step.output) {
                html += `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px 0; color: var(--text-secondary);">
                        <i data-lucide="loader" class="animate-spin" style="color: var(--accent-blue); width:24px; height:24px; margin-bottom:8px;"></i>
                        <p style="font-style: italic; font-size: 0.8rem;">Agent is initiating reasoning cycle...</p>
                    </div>
                `;
            } else if (step.output) {
                html += marked.parse(step.output);
            } else {
                html += `<p style="color: var(--text-muted); font-style: italic; font-size: 0.8rem;">Awaiting previous agent outputs...</p>`;
            }

            html += `
                    </div>
                </div>
            `;
        });

        html += '</div>';
        
        detailsContent.innerHTML = html;
        postProcessMarkdown(detailsContent);
        lucide.createIcons();

        // Bind toggle collapse listeners
        order.forEach(id => {
            const cardEl = document.getElementById(`timeline-card-${id}`);
            if (cardEl) {
                const headerEl = cardEl.querySelector(".timeline-card-header");
                headerEl.addEventListener("click", () => {
                    const step = currentSteps[id];
                    const wasCollapsed = cardEl.classList.contains("collapsed");
                    if (wasCollapsed) {
                        cardEl.classList.remove("collapsed");
                        if (step) step.collapsed = false;
                    } else {
                        cardEl.classList.add("collapsed");
                        if (step) step.collapsed = true;
                    }
                });
            }
        });

        // Focus & scroll to target card if requested
        if (focusId) {
            const targetCard = document.getElementById(`timeline-card-${focusId}`);
            if (targetCard) {
                // Ensure card is expanded
                targetCard.classList.remove("collapsed");
                const step = currentSteps[focusId];
                if (step) step.collapsed = false;
                
                // Add highlight
                targetCard.classList.add("highlight-focus");
                setTimeout(() => {
                    targetCard.classList.remove("highlight-focus");
                }, 1500);

                // Scroll into view inside detailsPanel body
                targetCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }
    }

    // =====================================================================
    // Interactive SVG Zoom & Drag Handlers
    // =====================================================================
    function initSvgZoomPan() {
        const svg = document.getElementById("graphSvg");
        const zoomGroup = document.getElementById("zoomGroup");
        if (!svg || !zoomGroup) return;

        svg.addEventListener("wheel", (e) => {
            e.preventDefault();
            const zoomFactor = 0.08;
            if (e.deltaY < 0) {
                zoomScale = Math.min(zoomScale + zoomFactor, 3.0);
            } else {
                zoomScale = Math.max(zoomScale - zoomFactor, 0.4);
            }
            applyZoom();
        }, { passive: false });

        svg.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return;
            const target = e.target;
            if (target.closest(".node-card")) return; // Don't drag if clicking node cards

            isDraggingGraph = true;
            dragStartX = e.clientX - zoomTranslateX;
            dragStartY = e.clientY - zoomTranslateY;
            svg.style.cursor = "grabbing";
        });

        window.addEventListener("mousemove", (e) => {
            if (!isDraggingGraph) return;
            zoomTranslateX = e.clientX - dragStartX;
            zoomTranslateY = e.clientY - dragStartY;
            applyZoom();
        });

        window.addEventListener("mouseup", () => {
            if (isDraggingGraph) {
                isDraggingGraph = false;
                svg.style.cursor = "default";
            }
        });

        document.getElementById("zoomInBtn").addEventListener("click", () => {
            zoomScale = Math.min(zoomScale + 0.25, 3.0);
            applyZoom();
        });
        document.getElementById("zoomOutBtn").addEventListener("click", () => {
            zoomScale = Math.max(zoomScale - 0.25, 0.4);
            applyZoom();
        });
        document.getElementById("zoomFitBtn").addEventListener("click", () => {
            zoomScale = 1.0;
            zoomTranslateX = 0;
            zoomTranslateY = 0;
            applyZoom();
        });
        document.getElementById("zoomResetBtn").addEventListener("click", () => {
            zoomScale = 1.0;
            zoomTranslateX = 0;
            zoomTranslateY = 0;
            applyZoom();
        });
    }

    function applyZoom() {
        const zoomGroup = document.getElementById("zoomGroup");
        if (zoomGroup) {
            zoomGroup.setAttribute("transform", `translate(${zoomTranslateX}, ${zoomTranslateY}) scale(${zoomScale})`);
        }
    }

    // =====================================================================
    // Interactive Canvas Constellation Backdrop Animation
    // =====================================================================
    function initNeuralBackground() {
        const canvas = document.getElementById("neuralCanvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        
        let width = canvas.width = canvas.offsetWidth;
        let height = canvas.height = canvas.offsetHeight;
        
        const dots = [];
        const maxDots = 70;
        const connectionDist = 125;
        let mouse = { x: null, y: null, radius: 160 };

        class Dot {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 0.45;
                this.vy = (Math.random() - 0.5) * 0.45;
                this.radius = Math.random() * 2 + 1.2;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > width) this.vx *= -1;
                if (this.y < 0 || this.y > height) this.vy *= -1;
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = isDarkTheme ? "rgba(99, 102, 241, 0.45)" : "rgba(79, 70, 229, 0.22)";
                ctx.fill();
            }
        }

        for (let i = 0; i < maxDots; i++) {
            dots.push(new Dot());
        }

        function animate() {
            ctx.clearRect(0, 0, width, height);
            dots.forEach(dot => {
                dot.update();
                dot.draw();
            });

            // Draw line connections between drifting stars
            for (let i = 0; i < dots.length; i++) {
                for (let j = i + 1; j < dots.length; j++) {
                    const dist = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
                    if (dist < connectionDist) {
                        const alpha = (1 - dist / connectionDist) * (isDarkTheme ? 0.15 : 0.08);
                        ctx.strokeStyle = isDarkTheme 
                            ? `rgba(99, 102, 241, ${alpha})` 
                            : `rgba(79, 70, 229, ${alpha})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(dots[i].x, dots[i].y);
                        ctx.lineTo(dots[j].x, dots[j].y);
                        ctx.stroke();
                    }
                }
            }

            // Draw magnetic links to cursor
            if (mouse.x !== null) {
                dots.forEach(dot => {
                    const dist = Math.hypot(dot.x - mouse.x, dot.y - mouse.y);
                    if (dist < mouse.radius) {
                        const alpha = (1 - dist / mouse.radius) * (isDarkTheme ? 0.26 : 0.14);
                        ctx.strokeStyle = isDarkTheme 
                            ? `rgba(6, 182, 212, ${alpha})` 
                            : `rgba(37, 99, 235, ${alpha})`;
                        ctx.beginPath();
                        ctx.moveTo(dot.x, dot.y);
                        ctx.lineTo(mouse.x, mouse.y);
                        ctx.stroke();
                    }
                });
            }

            requestAnimationFrame(animate);
        }

        window.addEventListener("resize", () => {
            width = canvas.width = canvas.offsetWidth;
            height = canvas.height = canvas.offsetHeight;
        });

        window.addEventListener("mousemove", (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        });

        window.addEventListener("mouseleave", () => {
            mouse.x = null;
            mouse.y = null;
        });

        animate();
    }

    // =====================================================================
    // Custom Markdown Code blocks post-processor
    // =====================================================================
    function postProcessMarkdown(element) {
        const preElements = element.querySelectorAll("pre");
        preElements.forEach(pre => {
            // Check if already processed
            if (pre.parentNode.classList.contains("code-block-wrapper")) return;

            const code = pre.querySelector("code");
            const languageClass = code ? code.className : "";
            let language = "code";
            if (languageClass.startsWith("language-")) {
                language = languageClass.replace("language-", "");
            }

            const codeText = pre.innerText;

            // Build structural elements
            const wrapper = document.createElement("div");
            wrapper.className = "code-block-wrapper";

            const header = document.createElement("div");
            header.className = "code-block-header";
            header.innerHTML = `
                <span class="code-lang-label">${language.toUpperCase()}</span>
                <button class="btn-copy-code"><i data-lucide="copy"></i> Copy</button>
            `;

            // Insert wrappers
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);

            // Bind copy logic
            header.querySelector(".btn-copy-code").addEventListener("click", (e) => {
                const btn = e.currentTarget;
                navigator.clipboard.writeText(codeText).then(() => {
                    btn.innerHTML = `<i data-lucide="check"></i> Copied!`;
                    lucide.createIcons();
                    setTimeout(() => {
                        btn.innerHTML = `<i data-lucide="copy"></i> Copy`;
                        lucide.createIcons();
                    }, 2000);
                });
            });
        });
        lucide.createIcons();
    }

    // =====================================================================
    // Export Data triggers
    // =====================================================================
    function exportMarkdownReport() {
        let md = `# AetherMind Run Export Report\n\n`;
        md += `**Problem Definition**: ${problemInput.value}\n\n`;
        md += `- **Topology**: ${topologySelect.value.toUpperCase()}\n`;
        md += `- **Model**: ${modelSelect.value}\n`;
        md += `- **Temperature**: ${tempSlider.value}\n`;
        md += `- **Date**: ${new Date().toLocaleString()}\n\n`;
        
        md += `## 1. Agent Reasoning Cycle Logs\n\n`;
        Object.values(currentSteps).forEach(step => {
            md += `### [${step.status.toUpperCase()}] ${step.label} (${step.duration}s)\n`;
            md += `${step.output || "_No logs generated_"}\n\n`;
            md += `---\n\n`;
        });

        md += `## 2. Synthesized Solution Output\n\n`;
        md += `${solutionContent.innerText}\n`;

        downloadBlob(md, `aethermind_report_${Date.now()}.md`, "text/markdown");
    }

    function exportJsonDataset() {
        const payload = {
            problem: problemInput.value,
            topology: topologySelect.value,
            model: modelSelect.value,
            temperature: parseFloat(tempSlider.value),
            custom_prompts: {
                decon: customPromptDecon.value,
                logic: customPromptLogic.value,
                critique: customPromptCritique.value,
                synth: customPromptSynth.value
            },
            timestamp: new Date().toISOString(),
            steps: currentSteps,
            final_output: solutionContent.innerText
        };
        downloadBlob(JSON.stringify(payload, null, 2), `aethermind_dataset_${Date.now()}.json`, "application/json");
    }

    function downloadBlob(content, filename, mimeType) {
        const fileBlob = new Blob([content], { type: mimeType });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(fileBlob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
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

        // Reset SVG scaling transformation matrix
        zoomScale = 1.0;
        zoomTranslateX = 0;
        zoomTranslateY = 0;
        applyZoom();

        // Redraw SVG graph & details
        renderGraph();
        
        // Render Final solution
        solutionContent.innerHTML = marked.parse(session.final_output);
        postProcessMarkdown(solutionContent);
        switchTab("solution");
        
        // Auto select final node
        selectedNodeId = "synthesis";
        renderGraph();
        renderTimeline("synthesis");
    }

    // Redraw on window resize
    window.addEventListener("resize", () => {
        renderGraph();
    });
});

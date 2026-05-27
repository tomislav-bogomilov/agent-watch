# Product Requirements Document (PRD): ClaudeWatch

## 1. Project Overview
**ClaudeWatch** is a post-session playback tool designed for developers and designers to analyze the decision-making process of a Claude Code agent. The goal is to provide a visual, intuitive animation of the agent's execution path, highlighting key decision milestones, tool calls, and architecture transitions.

---

## 2. Core Features & Animation Milestones
The visual playback will focus on a high-level representation of the AI agent's process, using distinct visual cues (colors/states) to map out the journey:

* **Root Prompt (Initial Intent):** The starting point of the task.
* **Subagent/Task Branching:** Visual nodes splitting when the agent breaks down a problem into sub-tasks.
* **Evaluations & Tool Calls:** Nodes representing active code execution, file reads, or self-correction steps.
* **Failure Loops & Backtracks:** Clear indicators showing when a path is pruned, fails, or triggers a backtrack.
* **Success Path:** A highlighted, glowing trail showing the final winning sequence of decisions that resolved the task.

---

## 3. Technical Stack
To ensure a modern, high-performance, and type-safe development workflow, the Proof of Concept (POC) will utilize:

* **Framework:** React 19
* **Language:** TypeScript
* **Build Tool:** Vite
* **Data Fetching & Caching:** TanStack Query (for efficient session log ingestion and state management)
* **Graphics/Animation Engine:** D3.js (integrated with React to handle tree layouts, transitions, and canvas/SVG rendering)

---

## 4. Testing Strategy (POC Scope)
To keep the proof of concept lightweight yet robust, the testing suite will be limited to a focused set of 3 to 5 critical End-to-End (E2E) tests powered by Vite's ecosystem.

### Core E2E Test Cases:
1.**Data Ingestion:** Verify that the system successfully loads, parses, and handles a raw Claude Code session log via TanStack Query.
2. **Initial Render:** Confirm that the D3 canvas mounts correctly and renders the initial decision tree layout based on the parsed data.
3. **Basic Interaction:** Verify that a user can interact with the graph (e.g., clicking to expand or collapse a node).
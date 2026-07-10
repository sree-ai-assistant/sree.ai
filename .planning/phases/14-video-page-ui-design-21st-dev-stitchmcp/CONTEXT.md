# Phase 14 Context: Video Page UI Design

## Domain Boundary & Overview
Create a high-fidelity glassmorphic Video Generation frontend page (`VideoGenPage.tsx`) using the Ethereal Obsidian design system tokens. The layout must be highly responsive (collapsing panels on mobile) and consistent with the established Image Generation page layout.

## User Decisions & UI Flow
* **Layout:** Option 1 - Collapsible Dual-Pane Sidebar Layout.
  * **Left Sidebar (Collapsible):** Displays settings for Model Selection, Aspect Ratios, Speed Tiers, and Audio settings.
  * **Main Content Area:** Displays the cinematic video player and a prompt input field at the bottom.
* **Aspect Ratios:** Visual representation (16:9, 9:16, 1:1).
* **Speed Tiers:** Segmented selector containing Standard ($0.40/sec standard or $0.60/sec for 4k), Fast ($0.10-$0.30/sec), and Lite ($0.05-$0.08/sec) tiers.
* **Audio Option:** An "Include Audio" toggle switch.
* **Dictate Mode:** The prompt input field must support a "Dictate" button (microphone icon) that records voice and transcribes it using `aiService.stt` (matching the dictation flow in `ChatInput.tsx`).

## Core Requirements & Constraints
* **Gating Constraint:** Only users on `Starter` or `Pro` plans can access the Video Generation page. Users on the `Free` tier must be blocked and prompted to upgrade via the billing settings redirect or the Upgrade limit modal.
* **Responsiveness:** Ensure seamless viewport adjustments on desktop, tablet, and mobile (collapsing sidebars, scaling aspect-ratio player box).

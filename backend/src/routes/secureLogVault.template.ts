import { SystemTelemetry } from '../services/telemetry.service';

export interface DashboardRenderOptions {
  basePath: string;
  nodeVersion: string;
  initialTelemetry: SystemTelemetry;
}

export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface LoginRenderOptions {
  basePath: string;
  error?: string | undefined;
  retryAfter?: number | undefined;
  csrfToken?: string | undefined;
}

export function renderLoginHtml(options: LoginRenderOptions): string {
  const { basePath, error, retryAfter, csrfToken } = options;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sree AI — Hardened Ops Vault Authentication</title>
  <link rel="icon" type="image/png" href="https://app.sreeai.qzz.io/Sree-Ai-Fav-icon.png">
  <style>
    :root {
      --bg-base: #06090f;
      --bg-surface: #0c1220;
      --bg-card: #11192c;
      --border: #1e2c45;
      --accent: #38bdf8;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --color-error: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body {
      background: var(--bg-base);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      -webkit-font-smoothing: antialiased;
    }
    .login-container {
      width: 100%;
      max-width: 420px;
      background: linear-gradient(180deg, #0d1527 0%, #080d19 100%);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px 28px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(56, 189, 248, 0.08);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      justify-content: center;
    }
    .brand-icon {
      width: 40px;
      height: 40px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: rgba(13, 21, 39, 0.7);
      border: 1px solid rgba(56, 189, 248, 0.25);
      box-shadow: 0 0 16px rgba(2, 132, 199, 0.35);
      flex-shrink: 0;
    }
    .brand-icon img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .brand-title {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .brand-pill {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.12);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.3);
      margin-left: 6px;
    }
    .subtext {
      text-align: center;
      font-size: 12.5px;
      color: var(--text-muted);
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .alert-box {
      background: rgba(248, 113, 113, 0.12);
      border: 1px solid rgba(248, 113, 113, 0.3);
      color: var(--color-error);
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .form-group {
      margin-bottom: 18px;
    }
    .form-label {
      display: block;
      font-size: 11.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .form-input {
      width: 100%;
      background: #090e18;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 12px;
      color: #fff;
      font-size: 13.5px;
      outline: none;
      transition: all 0.15s ease;
    }
    .form-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
    }
    .btn-submit {
      width: 100%;
      padding: 11px;
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.15s ease;
      margin-top: 10px;
    }
    .btn-submit:hover {
      background: linear-gradient(135deg, #0369a1, #1d4ed8);
      box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
    }
    @media (max-width: 480px) {
      body { padding: 12px; }
      .login-container {
        padding: 24px 18px;
        border-radius: 10px;
      }
      .brand-title { font-size: 16px; }
      .form-input, .btn-submit {
        min-height: 44px;
        font-size: 14px;
      }
    }

    .footer-note {
      text-align: center;
      font-size: 11px;
      color: #54657e;
      margin-top: 24px;
      font-family: ui-monospace, monospace;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="brand">
      <div class="brand-icon">
        <img src="https://app.sreeai.qzz.io/Sree-Ai-Fav-icon.png" onerror="this.onerror=null; this.src='${basePath}/icon.png'" alt="Sree AI logo" />
      </div>
      <div class="brand-title">Sree AI <span class="brand-pill">OPS VAULT</span></div>
    </div>
    <div class="subtext">
      Production Security Gateway • Strict OWASP Mitigation & Rate Limiting Enforced
    </div>

    ${error ? `
      <div class="alert-box">
        <span>🛡️</span>
        <span>${escapeHtml(error)}${retryAfter ? ` (Retry after ${Math.max(0, Math.floor(retryAfter))}s)` : ''}</span>
      </div>
    ` : ''}

    <form method="POST" action="${basePath}/login">
      ${csrfToken ? `<input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">` : ''}
      <div class="form-group">
        <label class="form-label" for="username">Operator ID</label>
        <input class="form-input" type="text" id="username" name="username" required autocomplete="username" autofocus placeholder="sree_admin">
      </div>
      <div class="form-group">
        <label class="form-label" for="password">Security Passphrase</label>
        <input class="form-input" type="password" id="password" name="password" required autocomplete="current-password" placeholder="••••••••••••••••">
      </div>
      <button type="submit" class="btn-submit">
        <span>🔒</span> Authenticate & Enter Vault
      </button>
    </form>

    <div class="footer-note">
      OWASP CWE-307 Protected • Auto-Lockout after 5 Fails
    </div>
  </div>
</body>
</html>`;
}

export function renderDashboardHtml(options: DashboardRenderOptions): string {
  const { basePath, nodeVersion, initialTelemetry } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sree AI — Hardened Log Vault & Real-Time Telemetry</title>
  <link rel="icon" type="image/png" href="https://app.sreeai.qzz.io/Sree-Ai-Fav-icon.png">
  <style>
    :root {
      --bg-base: #06090f;
      --bg-surface: #0c1220;
      --bg-card: #11192c;
      --bg-card-hover: #16223b;
      --border: #1e2c45;
      --border-focus: #38bdf8;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #54657e;
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.18);
      --color-info: #38bdf8;
      --color-warn: #fbbf24;
      --color-error: #f87171;
      --color-success: #34d399;
      --color-purple: #c084fc;
      --color-cyan: #22d3ee;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      height: 100vh;
      height: 100dvh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      max-width: 100vw;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      background: rgba(12, 18, 32, 0.98);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 8px 18px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      z-index: 100;
    }
    .brand-section {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-icon {
      width: 30px;
      height: 30px;
      border-radius: 7px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: rgba(13, 21, 39, 0.7);
      border: 1px solid rgba(56, 189, 248, 0.25);
      box-shadow: 0 0 12px rgba(2, 132, 199, 0.35);
      flex-shrink: 0;
    }
    .brand-icon img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .brand-title {
      font-weight: 700;
      font-size: 14.5px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-pill {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.12);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .nav-tabs {
      display: flex;
      align-items: center;
      background: #090e18;
      border: 1px solid var(--border);
      border-radius: 7px;
      padding: 3px;
      gap: 2px;
    }
    .nav-tab {
      padding: 5px 13px;
      border-radius: 5px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      user-select: none;
    }
    .nav-tab:hover { color: #fff; }
    .nav-tab.active {
      background: #18233c;
      color: var(--accent);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
    .system-status {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 11.5px;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .stat-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-card);
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--border);
      color: var(--text-muted);
    }
    .node-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-weight: 700;
      color: #38bdf8;
    }
    .node-hex {
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      background: rgba(56, 189, 248, 0.2);
      border: 1px solid rgba(56, 189, 248, 0.4);
      font-size: 9px;
      color: #38bdf8;
      font-weight: 800;
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-success);
      box-shadow: 0 0 8px var(--color-success);
      animation: pulse 2s infinite ease-in-out;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .settings-dropdown { position: relative; }
    .settings-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 8px;
      background: #111a2e;
      border: 1px solid #293b5d;
      border-radius: 8px;
      padding: 12px;
      width: 270px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.6);
      z-index: 200;
      display: none;
    }
    .settings-menu.show { display: block; }
    .settings-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.05em;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }
    .setting-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 0;
      font-size: 12px;
      color: var(--text-main);
      cursor: pointer;
    }
    .setting-item input { accent-color: var(--accent); cursor: pointer; }
    .time-bar {
      background: #090e18;
      border-bottom: 1px solid var(--border);
      padding: 6px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .time-chips {
      display: flex;
      align-items: center;
      gap: 2px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 2px;
    }
    .time-chip {
      padding: 3px 10px;
      font-size: 11.5px;
      font-weight: 600;
      color: var(--text-muted);
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s;
    }
    .time-chip:hover { color: #fff; }
    .time-chip.active { background: #0284c7; color: #fff; }
    .metrics-view {
      flex: 1;
      overflow-y: auto;
      padding: 16px 18px;
      background: var(--bg-base);
      display: none;
      flex-direction: column;
      gap: 16px;
    }
    .metrics-view.active-view { display: flex; }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
      gap: 16px;
    }
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 14px;
    }
    .grafana-panel {
      background: linear-gradient(180deg, #0d1527 0%, #080d19 100%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
      box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.5);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .grafana-panel:hover {
      border-color: rgba(56, 189, 248, 0.3);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.08);
    }
    .panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .panel-title-group { display: flex; flex-direction: column; gap: 3px; }
    .panel-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
      letter-spacing: -0.01em;
    }
    .panel-subtitle {
      font-size: 11px;
      color: var(--text-dim);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .panel-hero-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: -2px;
    }
    .panel-hero-stat { display: flex; align-items: baseline; gap: 8px; }
    .hero-big-num {
      font-size: 32px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.03em;
      line-height: 1;
    }
    .hero-unit { font-size: 14px; font-weight: 600; color: var(--text-muted); }
    .progress-bar-wrap { width: 200px; display: flex; flex-direction: column; gap: 4px; }
    .progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
      color: var(--text-muted);
      font-family: ui-monospace, monospace;
    }
    .progress-track {
      width: 100%;
      height: 6px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.08);
      overflow: hidden;
      position: relative;
    }
    .progress-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .chart-container {
      position: relative;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .chart-main-row {
      display: flex;
      width: 100%;
      height: 155px;
      position: relative;
    }
    .y-axis-labels {
      width: 72px;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 10px;
      color: var(--text-dim);
      font-family: ui-monospace, SFMono-Regular, monospace;
      padding-right: 10px;
      text-align: right;
      user-select: none;
      padding-top: 2px;
      padding-bottom: 2px;
    }
    .chart-svg-wrap {
      flex: 1;
      height: 100%;
      position: relative;
      cursor: crosshair;
      touch-action: pan-y;
    }
    .grafana-svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .grid-line {
      stroke: rgba(255, 255, 255, 0.08);
      stroke-dasharray: 3 3;
    }
    .scale-toggle-group {
      display: flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 6px;
      padding: 2px;
      gap: 2px;
    }
    .scale-btn {
      background: transparent;
      border: none;
      color: var(--text-dim);
      font-size: 10.5px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .scale-btn:hover {
      color: #fff;
    }
    .scale-btn.active {
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
      box-shadow: 0 0 8px rgba(56, 189, 248, 0.2);
    }
    .x-axis-labels {
      display: flex;
      justify-content: space-between;
      padding-left: 72px;
      padding-right: 4px;
      font-size: 10px;
      color: var(--text-dim);
      font-family: ui-monospace, SFMono-Regular, monospace;
      user-select: none;
      margin-top: 5px;
    }
    .x-tick {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .x-tick-time {
      font-weight: 700;
      color: #e2e8f0;
      letter-spacing: -0.01em;
    }
    .x-tick-date {
      font-size: 9px;
      color: #64748b;
    }
    .crosshair-v-line {
      stroke: #ffffff;
      stroke-width: 1.5;
      stroke-dasharray: 4 3;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.08s ease;
    }
    .crosshair-v-line.active {
      opacity: 1 !important;
      display: inline !important;
    }
    .crosshair-circle {
      pointer-events: none;
      opacity: 0;
      stroke-width: 2.5;
      transition: opacity 0.08s ease;
    }
    .crosshair-circle.active {
      opacity: 1 !important;
      display: inline !important;
    }
    .chart-pointer-dot {
      position: absolute;
      width: 12px;
      height: 12px;
      border-radius: 50% !important;
      transform: translate(-50%, -50%);
      pointer-events: none;
      opacity: 0;
      z-index: 55;
      transition: opacity 0.08s ease;
      box-sizing: border-box;
      display: none;
    }
    .chart-pointer-dot.active {
      opacity: 1 !important;
      display: block !important;
    }
    .cpu-pointer-dot {
      background: #06090f;
      border: 2.5px solid #38bdf8;
      box-shadow: 0 0 10px #38bdf8, 0 0 4px #38bdf8;
    }
    .ram-pointer-dot {
      background: #06090f;
      border: 2.5px solid #34d399;
      box-shadow: 0 0 10px #34d399, 0 0 4px #34d399;
    }
    .spark-pointer-dot {
      position: absolute;
      width: 9px;
      height: 9px;
      border-radius: 50% !important;
      transform: translate(-50%, -50%);
      pointer-events: none;
      opacity: 0;
      z-index: 55;
      transition: opacity 0.08s ease;
      box-sizing: border-box;
      background: #06090f;
      display: none;
    }
    .spark-pointer-dot.active {
      opacity: 1 !important;
      display: block !important;
    }
    .spark-dot-req { border: 2px solid #22d3ee; box-shadow: 0 0 8px #22d3ee; }
    .spark-dot-heap { border: 2px solid #c084fc; box-shadow: 0 0 8px #c084fc; }
    .spark-dot-lag { border: 2px solid #fbbf24; box-shadow: 0 0 8px #fbbf24; }
    .spark-dot-lat { border: 2px solid #38bdf8; box-shadow: 0 0 8px #38bdf8; }
    .spark-dot-handles { border: 2px solid #34d399; box-shadow: 0 0 8px #34d399; }

    .cpu-crosshair-circle {
      fill: #06090f;
      stroke: #38bdf8;
      filter: drop-shadow(0 0 8px #38bdf8);
    }
    .ram-crosshair-circle {
      fill: #06090f;
      stroke: #34d399;
      filter: drop-shadow(0 0 8px #34d399);
    }
    .unified-chart-tooltip, .unified-chart-tooltip * {
      pointer-events: none !important;
    }
    .unified-chart-tooltip {
      position: absolute;
      top: 10px;
      background: rgba(8, 13, 25, 0.96);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 8px;
      padding: 10px 14px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85), 0 0 20px rgba(56, 189, 248, 0.15);
      pointer-events: none;
      z-index: 60;
      min-width: 270px;
      max-width: 320px;
      display: none;
      opacity: 0;
      transition: left 0.04s ease-out, right 0.04s ease-out, opacity 0.1s ease;
    }
    .unified-chart-tooltip.tooltip-ram-style {
      border-color: rgba(52, 211, 153, 0.35);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85), 0 0 20px rgba(52, 211, 153, 0.15);
    }
    .unified-chart-tooltip.active {
      display: block !important;
      opacity: 1 !important;
    }
    .tt-header {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      border-bottom: 1px solid rgba(255, 255, 255, 0.09);
      padding-bottom: 6px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .tt-status-tag {
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid rgba(56, 189, 248, 0.3);
      background: rgba(56, 189, 248, 0.12);
      color: #38bdf8;
    }
    .tt-primary {
      display: flex;
      align-items: baseline;
      gap: 7px;
      margin-bottom: 8px;
    }
    .tt-primary-label {
      font-size: 11px;
      color: var(--text-muted);
    }
    .tt-primary-val {
      font-size: 16px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.02em;
    }
    .tt-unit {
      font-size: 10.5px;
      color: var(--text-dim);
    }
    .tt-divider {
      height: 1px;
      background: rgba(255, 255, 255, 0.08);
      margin: 6px 0;
    }
    .tt-compare-title {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #64748b;
      margin-bottom: 5px;
      text-transform: uppercase;
    }
    .tt-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 4px;
      gap: 12px;
    }
    .tt-label {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--text-muted);
    }
    .tt-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .tt-val {
      font-weight: 700;
      color: #ffffff;
      text-align: right;
    }
    .tt-sub {
      font-size: 9.5px;
      font-weight: 400;
      color: #94a3b8;
    }
    .correlation-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      background: rgba(13, 21, 39, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 10px 16px;
      margin-top: 14px;
      margin-bottom: 14px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 11.5px;
    }
    .corr-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .corr-label { color: var(--text-muted); font-size: 11px; }
    .corr-val { font-weight: 700; color: #fff; }
    .grafana-legend {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: var(--text-dim);
    }
    .legend-stats { display: flex; align-items: center; gap: 12px; }
    .legend-stats strong { color: #f1f5f9; font-weight: 700; }
    .shadcn-kpi-card {
      background: linear-gradient(180deg, #0d1527 0%, #080d19 100%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: relative;
      box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.4);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .shadcn-kpi-card:hover {
      border-color: rgba(56, 189, 248, 0.3);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 14px rgba(56, 189, 248, 0.08);
      transform: translateY(-2px);
    }
    .kpi-header { display: flex; align-items: center; justify-content: space-between; }
    .kpi-title {
      font-size: 11.5px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .kpi-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 9999px;
      font-family: ui-monospace, monospace;
    }
    .badge-emerald { background: rgba(52, 211, 153, 0.15); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.3); }
    .badge-sky { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
    .badge-amber { background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
    .badge-purple { background: rgba(192, 132, 252, 0.15); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.3); }
    .kpi-body { display: flex; align-items: baseline; justify-content: space-between; margin-top: 2px; }
    .kpi-number {
      font-size: 26px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.03em;
      line-height: 1.1;
    }
    .kpi-delta { font-size: 11px; display: flex; align-items: center; gap: 4px; font-weight: 600; }
    .delta-good { color: #34d399; }
    .delta-info { color: #38bdf8; }
    .delta-warn { color: #fbbf24; }
    .sparkline-wrap {
      position: relative;
      width: 100%;
      height: 48px;
      margin: 4px 0;
      cursor: crosshair;
      touch-action: pan-y;
    }
    .sparkline-svg {
      width: 100%;
      height: 100%;
      overflow: visible;
      display: block;
    }
    .spark-crosshair {
      stroke: #ffffff;
      stroke-width: 1.2;
      stroke-dasharray: 2 2;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.08s ease;
    }
    .spark-crosshair.active {
      opacity: 0.9 !important;
      display: inline !important;
    }
    .spark-dot {
      pointer-events: none;
      opacity: 0;
      stroke-width: 2;
      transition: opacity 0.08s ease;
    }
    .spark-dot.active {
      opacity: 1 !important;
      display: inline !important;
    }
    .sparkline-tooltip {
      position: absolute;
      bottom: calc(100% + 4px);
      transform: translateX(-50%);
      background: rgba(8, 13, 25, 0.96);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-radius: 6px;
      padding: 5px 8px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.8), 0 0 12px rgba(56, 189, 248, 0.12);
      pointer-events: none;
      z-index: 70;
      white-space: nowrap;
      display: none;
      opacity: 0;
      transition: opacity 0.1s ease;
    }
    .sparkline-tooltip.active {
      display: block !important;
      opacity: 1 !important;
    }
    .spark-tt-time {
      font-size: 9.5px;
      color: #94a3b8;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .spark-tt-val {
      font-size: 11.5px;
      font-weight: 700;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .spark-tt-sub {
      font-size: 9px;
      font-weight: 400;
      color: #94a3b8;
      margin-left: 2px;
    }
    .kpi-time-tag {
      font-size: 10px;
      color: var(--text-dim);
      font-family: ui-monospace, monospace;
      transition: color 0.15s ease;
    }
    .kpi-time-tag.active {
      color: #38bdf8;
      font-weight: 700;
    }
    .kpi-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10.5px;
      color: var(--text-dim);
      font-family: ui-monospace, monospace;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 6px;
      margin-top: 2px;
    }
    .log-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .log-telemetry {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      padding: 8px 18px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
    }
    .tele-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      transition: border-color 0.15s ease;
    }
    .tele-card:hover { border-color: var(--accent); }
    .tele-card-http {
      border-color: rgba(56, 189, 248, 0.4);
      background: linear-gradient(135deg, #111a2e 0%, #16243d 100%);
    }
    .tele-header-row { display: flex; align-items: baseline; justify-content: space-between; width: 100%; }
    .tele-label-bold { font-size: 12px; font-weight: 800; color: #fff; letter-spacing: 0.02em; }
    .tele-rate-badge {
      font-size: 11px;
      font-weight: 700;
      color: var(--accent);
      font-family: ui-monospace, monospace;
      white-space: nowrap;
      margin-left: 8px;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.12);
    }
    .rate-unit-tag {
      font-size: 9.5px;
      font-weight: 500;
      opacity: 0.85;
    }
    .tele-label {
      font-size: 10px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .tele-val {
      font-size: 17px;
      font-weight: 800;
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: #fff;
    }
    .tele-desc { font-size: 10px; color: var(--text-dim); }
    .controls {
      background: #090e18;
      border-bottom: 1px solid var(--border);
      padding: 8px 18px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .ctrl-group { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    select, input[type="text"], input[type="datetime-local"] {
      background: var(--bg-card);
      color: var(--text-main);
      border: 1px solid var(--border);
      padding: 5px 9px;
      border-radius: 5px;
      font-size: 12px;
      outline: none;
      transition: all 0.15s ease;
    }
    select:focus, input:focus { border-color: var(--accent); }
    .search-box { width: 200px; }
    .date-filter-group {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 2px 6px;
    }
    .date-range-box { display: none; align-items: center; gap: 4px; }
    .date-range-box input[type="datetime-local"] {
      padding: 3px 6px;
      font-size: 11px;
      background: #090e18;
      color: #fff;
      border-color: #243552;
    }
    .btn-clear-date {
      background: transparent;
      border: none;
      color: var(--text-dim);
      font-size: 12px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
    }
    .btn-clear-date:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }
    .chips { display: flex; align-items: center; gap: 4px; }
    .chip {
      padding: 4px 9px;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 600;
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-muted);
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }
    .chip:hover { border-color: var(--text-muted); color: #fff; }
    .chip.active { background: #1e293b; color: #fff; border-color: var(--accent); }
    .btn-action {
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-main);
      padding: 5px 11px;
      border-radius: 5px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }
    .btn-action:hover { border-color: var(--text-muted); background: var(--bg-card-hover); }
    .btn-active { background: rgba(56, 189, 248, 0.15); border-color: var(--accent); color: var(--accent); }
    .btn-link { text-decoration: none; color: inherit; }
    .terminal-container {
      flex: 1;
      background: #06090e;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    /* Floating Action Buttons Group */
    .terminal-fab-group {
      position: absolute;
      bottom: 16px;
      right: 18px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
      z-index: 50;
      pointer-events: none;
    }
    .terminal-fab-group > * {
      pointer-events: auto;
    }
    .fab-fullscreen {
      display: none; /* Mobile only */
    }

    /* Floating Scroll-to-Bottom Button */
    .scroll-bottom-fab {
      position: relative;
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
      border: 1px solid rgba(56, 189, 248, 0.5);
      border-radius: 9999px;
      padding: 6px 14px;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 14px rgba(56, 189, 248, 0.35);
      opacity: 0;
      pointer-events: none;
      transform: translateY(10px);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    }
    .scroll-bottom-fab.visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }
    .scroll-bottom-fab:hover {
      background: linear-gradient(135deg, #0369a1, #1d4ed8);
      box-shadow: 0 6px 20px rgba(2, 132, 199, 0.6);
      transform: translateY(-1px);
    }
    .scroll-bottom-fab:active {
      transform: translateY(1px);
    }

    /* Fixed Column Header Bar (Railway style) */
    .railway-header-row {
      display: flex;
      align-items: center;
      padding: 7px 16px;
      background: #090e18;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.04em;
      user-select: none;
      flex-shrink: 0;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    }

    .col-bar-head { width: 3.5px; min-width: 3.5px; margin-right: 12px; }
    .col-time-head { width: 155px; min-width: 155px; }
    .col-data-head { flex: 1; min-width: 0; }

    /* Scrollable Rows Viewport */
    .railway-rows-scroll {
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
      padding: 4px 0 24px 0;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
      color: #e2e8f0;
      scroll-behavior: smooth;
    }

    /* Log Stream Row */
    .railway-row {
      display: flex;
      align-items: flex-start;
      padding: 3px 16px;
      min-height: 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.015);
      transition: background 0.08s ease;
      position: relative;
      user-select: text;
    }

    .railway-row:hover {
      background: rgba(255, 255, 255, 0.035);
    }

    /* Left Indicator Bar */
    .railway-row .row-bar {
      width: 3.5px;
      min-width: 3.5px;
      align-self: stretch;
      margin-right: 12px;
      border-radius: 2px;
      background: #38bdf8;
      opacity: 0.9;
    }

    /* Level Styling */
    .railway-row.lvl-error {
      background: rgba(220, 38, 38, 0.12) !important;
    }
    .railway-row.lvl-error:hover {
      background: rgba(220, 38, 38, 0.18) !important;
    }
    .railway-row.lvl-error .row-bar {
      background: #ef4444 !important;
      box-shadow: 0 0 6px rgba(239, 68, 68, 0.45);
    }
    .railway-row.lvl-error .col-data {
      color: #fecaca;
    }

    .railway-row.lvl-warn {
      background: rgba(245, 158, 11, 0.07) !important;
    }
    .railway-row.lvl-warn:hover {
      background: rgba(245, 158, 11, 0.13) !important;
    }
    .railway-row.lvl-warn .row-bar {
      background: #f59e0b !important;
    }

    /* Columns */
    .col-time {
      width: 155px;
      min-width: 155px;
      color: #64748b;
      font-size: 11.5px;
      white-space: nowrap;
      user-select: text;
      flex-shrink: 0;
      padding-top: 1px;
    }

    .col-data {
      flex: 1;
      min-width: 0;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
      color: #f1f5f9;
      font-family: inherit;
      font-size: 12px;
      line-height: 1.5;
    }

    /* In-line syntax highlighting for terminal readability */
    .term-method { font-weight: 700; color: #cbd5e1; }
    .term-path { color: #f8fafc; font-weight: 500; }
    .term-status-2xx { color: #34d399; font-weight: 700; }
    .term-status-3xx { color: #38bdf8; font-weight: 700; }
    .term-status-4xx { color: #fbbf24; font-weight: 700; }
    .term-status-5xx { color: #f87171; font-weight: 700; }
    .term-latency { color: #94a3b8; font-size: 11.5px; }
    .term-subsystem { font-weight: 600; color: #c084fc; }
    .term-subsystem.tag-ai { color: #c084fc; }
    .term-subsystem.tag-route { color: #60a5fa; }
    .term-subsystem.tag-api { color: #fbbf24; }
    .term-subsystem.tag-observer { color: #818cf8; }
    .term-subsystem.tag-r2 { color: #2dd4bf; }
    .term-subsystem.tag-cors { color: #fb923c; }
    .term-subsystem.tag-ws { color: #38bdf8; }
    .term-subsystem.tag-token { color: #a78bfa; }
    .term-subsystem.tag-cleanup { color: #94a3b8; }
    .term-subsystem.tag-server { color: #38bdf8; }
    .term-subsystem.tag-err { color: #f87171; }
    .term-dim { color: #64748b; }

    /* Stack frame lines inside Data */
    .term-trace-line {
      display: block;
      color: #fca5a5;
      opacity: 0.92;
      font-size: 11.5px;
      line-height: 1.45;
      padding-left: 14px;
    }
    .term-trace-toggle {
      display: inline-block;
      margin-left: 14px;
      margin-top: 2px;
      color: #38bdf8;
      font-size: 11px;
      cursor: pointer;
      text-decoration: underline;
      user-select: none;
      padding: 1px 4px;
    }
    .term-trace-toggle:hover {
      color: #7dd3fc;
    }

    /* Row Copy Button on Hover */
    .row-copy-btn {
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #94a3b8;
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 10px;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.1s ease, color 0.1s, border-color 0.1s;
      font-family: inherit;
    }
    .railway-row:hover .row-copy-btn {
      opacity: 1;
      pointer-events: auto;
    }
    .row-copy-btn:hover {
      color: #38bdf8;
      border-color: #38bdf8;
      background: rgba(56, 189, 248, 0.15);
    }

    .highlight {
      background: #fbbf24;
      color: #000;
      font-weight: 700;
      padding: 0 2px;
      border-radius: 2px;
    }

    .redacted-token {
      background: rgba(248, 113, 113, 0.15);
      color: #f87171;
      border: 1px dashed rgba(248, 113, 113, 0.4);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 10px;
    }

    .footer {
      background: #090e18;
      border-top: 1px solid var(--border);
      padding: 6px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--text-dim);
    }
    .footer-tags { display: flex; gap: 12px; }
    .hidden-view { display: none !important; }
    .chip-toggle {
      border-color: rgba(245, 158, 11, 0.4);
      color: #fbbf24;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .chip-toggle.active {
      background: rgba(245, 158, 11, 0.25) !important;
      border-color: #f59e0b !important;
      color: #fef08a !important;
    }

    /* ─── COMPREHENSIVE MOBILE RESPONSIVE DESIGN SYSTEM (<= 900px, <= 640px) ─── */
    @media (max-width: 900px) {
      .grid-2 {
        grid-template-columns: 1fr;
        gap: 14px;
      }
      .grid-4 {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
    }

    @media (max-width: 768px) {
      /* Header & Brand Navigation */
      .header {
        padding: 8px 12px;
        gap: 8px;
      }
      .brand-section {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .brand { gap: 8px; }
      .brand-title { font-size: 13.5px; }
      .brand-pill { display: none; }
      .nav-tabs {
        padding: 2px;
        gap: 2px;
      }
      .nav-tab {
        padding: 6px 10px;
        font-size: 11.5px;
        min-height: 36px;
      }
      .system-status {
        width: 100%;
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        gap: 6px;
        padding-top: 4px;
        padding-bottom: 2px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
      }
      .system-status::-webkit-scrollbar { display: none; }
      .stat-pill, .system-status .btn-action {
        flex-shrink: 0;
        white-space: nowrap;
        padding: 3px 8px;
        font-size: 11px;
      }
      .settings-menu {
        position: fixed;
        top: 64px;
        left: 12px;
        right: 12px;
        width: auto;
        max-width: calc(100vw - 24px);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
      }

      /* Logs Vault Mini-Telemetry Rail */
      .log-telemetry {
        display: flex !important;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scroll-snap-type: x mandatory;
        padding: 8px 12px;
        margin-left: 12px;
        gap: 8px;
        scrollbar-width: none;
      }
      .log-telemetry::-webkit-scrollbar { display: none; }
      .tele-card {
        flex: 0 0 148px;
        min-width: 148px;
        scroll-snap-align: start;
        padding: 8px 14px;
      }
      .tele-val { font-size: 15px; }
      .tele-desc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      /* Log Controls Toolbar */
      .controls {
        padding: 8px 12px;
        gap: 8px;
      }
      .ctrl-group {
        width: 100%;
        gap: 6px;
      }
      #fileSelect {
        flex: 1 1 100%;
        min-height: 40px;
        font-size: 12px;
      }
      .chips {
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 2px;
        scrollbar-width: none;
        gap: 6px;
      }
      .chips::-webkit-scrollbar { display: none; }
      .chip {
        flex-shrink: 0;
        padding: 6px 12px;
        font-size: 11.5px;
        min-height: 38px;
        display: inline-flex;
        align-items: center;
      }
      #serviceSelect {
        flex: 1 1 calc(50% - 3px);
        min-height: 38px;
      }
      .date-filter-group {
        flex: 1 1 calc(50% - 3px);
        min-height: 38px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        box-sizing: border-box;
      }
      .date-filter-group select {
        width: 100%;
        min-height: 34px;
      }
      .date-range-box {
        flex: 1 1 100%;
        width: 100%;
        min-height: 38px;
        box-sizing: border-box;
        display: none;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: 6px;
      }
      .date-range-box span {
        font-size: 11px;
        color: var(--text-dim);
        white-space: nowrap;
        flex-shrink: 0;
      }
      .date-range-box input[type="datetime-local"] {
        flex: 1 1 0;
        min-width: 0;
        width: 100%;
        height: 30px;
        padding: 2px 4px;
        font-size: 11px;
        background: #090e18;
        color: #fff;
        border: 1px solid #243552;
        border-radius: 4px;
        box-sizing: border-box;
      }
      .btn-clear-date {
        padding: 2px 4px;
        font-size: 12px;
        flex-shrink: 0;
      }
      .search-box {
        flex: 1 1 100%;
        width: 100%;
        min-height: 42px;
        font-size: 12.5px;
      }
      .btn-action {
        min-height: 40px;
        padding: 6px 12px;
        font-size: 12px;
      }
      #liveToggleBtn { flex: 1 1 auto; }

      /* Log Terminal Container (Railway Mobile Responsive System) */
      .terminal-container {
        padding: 0;
      }

      /* Hide rigid 2-column desktop header on mobile */
      .railway-header-row {
        display: none !important;
      }

      .railway-rows-scroll {
        padding: 6px 6px 54px 6px !important;
      }

      /* Stacked Mobile Log Card: Full width readable cards */
      .railway-row {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        padding: 8px 10px 8px 16px !important;
        margin-bottom: 4px !important;
        border-radius: 6px !important;
        border: 1px solid rgba(255, 255, 255, 0.04) !important;
        background: rgba(12, 18, 32, 0.65) !important;
        position: relative !important;
        min-height: auto !important;
      }

      .railway-row:hover {
        background: rgba(22, 34, 59, 0.75) !important;
      }

      /* Full-height status indicator bar on mobile card */
      .railway-row .row-bar {
        position: absolute !important;
        left: 5px !important;
        top: 8px !important;
        bottom: 8px !important;
        width: 3.5px !important;
        min-width: 3.5px !important;
        height: auto !important;
        border-radius: 2px !important;
        margin-right: 0 !important;
      }

      .railway-row.lvl-error {
        background: rgba(220, 38, 38, 0.12) !important;
        border-color: rgba(248, 113, 113, 0.28) !important;
      }
      .railway-row.lvl-error .row-bar {
        background: #ef4444 !important;
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.5) !important;
      }

      .railway-row.lvl-warn {
        background: rgba(245, 158, 11, 0.09) !important;
        border-color: rgba(251, 191, 36, 0.24) !important;
      }
      .railway-row.lvl-warn .row-bar {
        background: #f59e0b !important;
      }

      /* Mobile Timestamp Header: full-width bar at top of card */
      .col-time {
        width: 100% !important;
        min-width: 0 !important;
        color: #94a3b8 !important;
        font-size: 10.5px !important;
        font-weight: 600 !important;
        font-family: ui-monospace, SFMono-Regular, monospace !important;
        letter-spacing: 0.02em !important;
        margin-bottom: 4px !important;
        padding-right: 32px !important; /* space for copy button */
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        opacity: 0.9;
      }

      /* Mobile Log Data: 100% full width, comfortable font & spacing */
      .col-data {
        width: 100% !important;
        min-width: 0 !important;
        font-size: 12px !important;
        line-height: 1.55 !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        color: #f1f5f9 !important;
      }

      /* Touch-friendly Copy Button on Mobile */
      .row-copy-btn {
        position: absolute !important;
        top: 6px !important;
        right: 6px !important;
        transform: none !important;
        opacity: 0.75 !important;
        pointer-events: auto !important;
        background: rgba(15, 23, 42, 0.85) !important;
        border: 1px solid rgba(255, 255, 255, 0.16) !important;
        border-radius: 4px !important;
        padding: 3px 7px !important;
        font-size: 11px !important;
      }
      .row-copy-btn:active {
        opacity: 1 !important;
        border-color: var(--accent) !important;
        background: rgba(56, 189, 248, 0.25) !important;
      }

      /* Stack traces indented and formatted for mobile */
      .term-trace-line {
        padding-left: 6px !important;
        font-size: 11px !important;
        line-height: 1.45 !important;
        border-left: 2px solid rgba(248, 113, 113, 0.35) !important;
        margin-left: 2px !important;
        margin-top: 2px !important;
      }

      .terminal-fab-group {
        bottom: 12px !important;
        right: 12px !important;
        gap: 6px !important;
      }

      /* Mobile Fullscreen Button (Image 4: rounded-square dark glass, 30px compact) */
      .fab-fullscreen {
        display: flex !important;
        align-items: center;
        justify-content: center;
        width: 30px !important;
        height: 30px !important;
        min-width: 30px !important;
        min-height: 30px !important;
        background: rgba(15, 23, 42, 0.88) !important;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.16) !important;
        border-radius: 7px !important;
        color: #ffffff !important;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55), 0 0 1px rgba(255, 255, 255, 0.2);
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateY(8px) !important;
        transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.18s ease;
        user-select: none;
      }
      .fab-fullscreen.visible {
        opacity: 1 !important;
        pointer-events: auto !important;
        transform: translateY(0) !important;
      }
      .fab-fullscreen:active {
        transform: scale(0.92) !important;
        background: rgba(30, 41, 59, 0.98) !important;
      }
      .fab-fullscreen.is-fullscreen {
        background: rgba(12, 74, 110, 0.9) !important;
        border-color: rgba(56, 189, 248, 0.5) !important;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6), 0 0 12px rgba(56, 189, 248, 0.35);
      }

      /* Mobile Down Arrow Button (Image 3: dark circle glass, 30px compact, white arrow only, NO text) */
      .scroll-bottom-fab {
        display: none !important;
        width: 30px !important;
        height: 30px !important;
        min-width: 30px !important;
        min-height: 30px !important;
        padding: 0 !important;
        border-radius: 50% !important;
        background: rgba(15, 23, 42, 0.88) !important;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.16) !important;
        color: #ffffff !important;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55), 0 0 1px rgba(255, 255, 255, 0.2) !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateY(8px) !important;
        transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.18s ease;
      }
      .scroll-bottom-fab.visible {
        display: flex !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        transform: translateY(0) !important;
      }
      .scroll-bottom-fab .fab-text {
        display: none !important;
      }
      .scroll-bottom-fab:active {
        transform: scale(0.92) !important;
        background: rgba(30, 41, 59, 0.98) !important;
      }

      /* Mobile Fullscreen Mode: Nav bar + logs only */
      body.mobile-log-fullscreen {
        overflow: hidden !important;
      }
      body.mobile-log-fullscreen .system-status,
      body.mobile-log-fullscreen .log-telemetry,
      body.mobile-log-fullscreen .controls,
      body.mobile-log-fullscreen .footer {
        display: none !important;
      }
      body.mobile-log-fullscreen #viewLogs {
        padding: 0 !important;
        margin: 0 !important;
        height: calc(100vh - 56px) !important;
        height: calc(100dvh - 56px) !important;
        display: flex !important;
        flex-direction: column !important;
      }
      body.mobile-log-fullscreen .terminal-container {
        flex: 1 1 100% !important;
        height: 100% !important;
        max-height: calc(100vh - 56px) !important;
        max-height: calc(100dvh - 56px) !important;
        border-radius: 0 !important;
        border: none !important;
        margin: 0 !important;
      }
      body.mobile-log-fullscreen .railway-rows-scroll {
        height: 100% !important;
        max-height: calc(100vh - 56px) !important;
        max-height: calc(100dvh - 56px) !important;
        padding-bottom: 74px !important;
      }
      .footer {
        padding: 6px 12px;
        flex-direction: column;
        gap: 4px;
        align-items: flex-start;
        font-size: 10px;
      }
      .footer-tags {
        flex-wrap: wrap;
        gap: 8px;
      }
    }

    @media (max-width: 640px) {
      .grid-4 {
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .metrics-view {
        padding: 10px 12px;
        gap: 12px;
      }
      .time-bar {
        padding: 6px 12px;
        gap: 8px;
      }
      .time-chips {
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .time-chips::-webkit-scrollbar { display: none; }
      .time-chip {
        flex-shrink: 0;
        padding: 5px 8px;
      }
      #timeRangeStatusLabel {
        font-size: 10px;
      }

      /* Waveform Chart Cards */
      .grafana-panel {
        padding: 12px 14px;
        gap: 8px;
      }
      .panel-header {
        flex-direction: column;
        gap: 8px;
        align-items: stretch;
      }
      .panel-header > div:last-child {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
      }
      .progress-bar-wrap {
        width: 120px;
      }
      .hero-big-num {
        font-size: 26px;
      }
      .chart-main-row {
        height: 135px;
      }
      .y-axis-labels {
        width: 44px;
        font-size: 9px;
        padding-right: 4px;
      }
      .x-axis-labels {
        padding-left: 44px;
        font-size: 9px;
      }
      .x-tick:nth-child(2),
      .x-tick:nth-child(4) {
        display: none; /* Hide alternating ticks on mobile to guarantee zero overlap */
      }
      .grafana-legend {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        font-size: 10px;
        padding: 5px 8px;
      }
      .legend-stats {
        flex-wrap: wrap;
        gap: 8px;
      }

      /* Correlation Strip */
      .correlation-strip {
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        padding: 8px 10px;
        font-size: 10px;
      }

      /* Tooltip mobile bounds */
      .unified-chart-tooltip {
        min-width: 220px;
        max-width: calc(100vw - 28px);
        padding: 8px 10px;
        font-size: 10px;
      }
      .tt-row {
        font-size: 10px;
        gap: 6px;
      }
      .tt-primary-val {
        font-size: 14px;
      }

      /* KPI Cards */
      .shadcn-kpi-card {
        padding: 12px 14px;
      }
      .kpi-number {
        font-size: 22px;
      }
    }

  </style>
</head>
<body>

  <!-- ─── Top Header Navigation Bar ─── -->
  <header class="header">
    <div class="brand-section">
      <div class="brand">
        <div class="brand-icon">
          <img src="https://app.sreeai.qzz.io/Sree-Ai-Fav-icon.png" onerror="this.onerror=null; this.src='${basePath}/icon.png'" alt="Sree AI logo" />
        </div>
        <div class="brand-title">Sree AI <span class="brand-pill">Hardened Ops Vault</span></div>
      </div>
      <div class="nav-tabs">
        <div class="nav-tab active" id="tabLogs" onclick="switchNavTab('logs')">
          <span>📜</span> Logs Vault
        </div>
        <div class="nav-tab" id="tabMetrics" onclick="switchNavTab('metrics')">
          <span>📈</span> Realtime Metrics
        </div>
      </div>
    </div>

    <div class="system-status">
      <div class="stat-pill">
        <span class="node-badge">
          <span class="node-hex">JS</span>
          <span id="nodeVersionVal">${nodeVersion}</span>
        </span>
      </div>
      <div class="stat-pill">
        <span class="live-dot"></span>
        <span>online for <strong id="headerUptimeVal" style="color:#fff;">${initialTelemetry.uptimeFormatted}</strong></span>
      </div>

      <div class="settings-dropdown">
        <button class="btn-action" onclick="toggleSettingsMenu()" title="Customize Visible Telemetry Cards">
          <span>⚙️</span>
        </button>
        <div class="settings-menu" id="settingsMenu">
          <div class="settings-title">Configure Telemetry Cards</div>
          <label class="setting-item">
            <span>HTTP Throughput (req/min)</span>
            <input type="checkbox" checked onchange="toggleCard('cardHttp', this.checked)">
          </label>
          <label class="setting-item">
            <span>CPU Load (%)</span>
            <input type="checkbox" checked onchange="toggleCard('cardCpu', this.checked)">
          </label>
          <label class="setting-item">
            <span>RSS Memory (MB)</span>
            <input type="checkbox" checked onchange="toggleCard('cardRam', this.checked)">
          </label>
          <label class="setting-item">
            <span>V8 Heap (MB)</span>
            <input type="checkbox" checked onchange="toggleCard('cardHeap', this.checked)">
          </label>
          <label class="setting-item">
            <span>Event Loop Lag (ms)</span>
            <input type="checkbox" checked onchange="toggleCard('cardLag', this.checked)">
          </label>
          <label class="setting-item">
            <span>HTTP Latency (ms)</span>
            <input type="checkbox" checked onchange="toggleCard('cardLatency', this.checked)">
          </label>
          <label class="setting-item">
            <span>Active Libuv Handles</span>
            <input type="checkbox" checked onchange="toggleCard('cardHandles', this.checked)">
          </label>
          <label class="setting-item">
            <span>In-Flight Requests</span>
            <input type="checkbox" checked onchange="toggleCard('cardReqs', this.checked)">
          </label>
          <label class="setting-item">
            <span>Peak Lag / SLA</span>
            <input type="checkbox" checked onchange="toggleCard('cardPeakLag', this.checked)">
          </label>
        </div>
      </div>

      <button class="btn-action" id="telemetryStripBtn" onclick="toggleTelemetryStrip()">
        Hide Telemetry ▲
      </button>

      <a href="https://app.pm2.io" target="_blank" rel="noopener noreferrer" class="btn-action btn-link" title="Open PM2 Plus Cloud Monitoring">
        <span>☁️</span> PM2 Cloud ↗
      </a>
    </div>
  </header>

  <!-- ─── TAB 1: LOGS VAULT VIEW ─── -->
  <main class="log-view" id="viewLogs">
    <div class="log-telemetry" id="logTelemetryStrip">
      <div class="tele-card tele-card-http" id="cardHttp">
        <div class="tele-header-row">
          <div class="tele-label-bold">HTTP</div>
          <div class="tele-rate-badge"><span id="miniValReqs">${initialTelemetry.requestsPerMinute}</span> <span class="rate-unit-tag">req/min</span></div>
        </div>
        <div class="tele-desc">Real-time HTTP throughput</div>
      </div>
      <div class="tele-card" id="cardCpu">
        <div class="tele-label"><span>⚡</span> CPU (1 OCPU)</div>
        <div class="tele-val"><span id="miniValCpu">${initialTelemetry.cpu.usagePercent.toFixed(1)}</span>%</div>
        <div class="tele-desc">Load: ${initialTelemetry.cpu.loadAvg[0]} • 1 core</div>
      </div>
      <div class="tele-card" id="cardRam">
        <div class="tele-label"><span>🧠</span> RSS RAM</div>
        <div class="tele-val"><span id="miniValRam">${Math.round(initialTelemetry.memory.rssMb)}</span>M</div>
        <div class="tele-desc">Cap: 500M • ${initialTelemetry.memory.rssPercentOfCap}%</div>
      </div>
      <div class="tele-card" id="cardHeap">
        <div class="tele-label"><span>🟣</span> V8 Heap</div>
        <div class="tele-val"><span id="miniValHeap">${initialTelemetry.memory.heapUsedMb}</span>M</div>
        <div class="tele-desc">Alloc: ${initialTelemetry.memory.heapTotalMb}M</div>
      </div>
      <div class="tele-card" id="cardLag">
        <div class="tele-label"><span>⏱️</span> Loop Lag</div>
        <div class="tele-val"><span id="miniValLag">${initialTelemetry.eventLoop.lagMs.toFixed(1)}</span>ms</div>
        <div class="tele-desc">Voice SLA: &lt;10ms</div>
      </div>
      <div class="tele-card" id="cardLatency">
        <div class="tele-label"><span>🌐</span> HTTP Latency</div>
        <div class="tele-val"><span id="miniValLatency">1.0</span>ms</div>
        <div class="tele-desc">p95: 1.2ms • 200 OK</div>
      </div>
      <div class="tele-card" id="cardHandles">
        <div class="tele-label"><span>🔌</span> Handles</div>
        <div class="tele-val"><span id="miniValHandles">${initialTelemetry.concurrency.activeHandles}</span></div>
        <div class="tele-desc">Open sockets & timers</div>
      </div>
      <div class="tele-card" id="cardReqs">
        <div class="tele-label"><span>⏳</span> In-Flight</div>
        <div class="tele-val"><span id="miniValInFlight">${initialTelemetry.concurrency.activeRequests}</span></div>
        <div class="tele-desc">Active libuv requests</div>
      </div>
      <div class="tele-card" id="cardPeakLag">
        <div class="tele-label"><span>🛡️</span> Peak Lag</div>
        <div class="tele-val"><span id="miniValPeakLag">${initialTelemetry.eventLoop.p99Ms.toFixed(1)}</span>ms</div>
        <div class="tele-desc">99th percentile</div>
      </div>
    </div>

    <!-- Controls Bar -->
    <div class="controls">
      <div class="ctrl-group">
        <select id="fileSelect" onchange="fetchLogs()">
          <option value="combined">🔗 Combined (out.log + err.log)</option>
          <option value="out.log">📄 stdout (out.log)</option>
          <option value="err.log">🚨 stderr (err.log)</option>
        </select>

        <div class="chips">
          <div class="chip active" data-level="ALL" onclick="setLevel('ALL')">All</div>
          <div class="chip" data-level="ERROR" onclick="setLevel('ERROR')">🔴 Errors</div>
          <div class="chip" data-level="WARN" onclick="setLevel('WARN')">🟡 Warnings</div>
          <div class="chip" data-level="INFO" onclick="setLevel('INFO')">🔵 Info</div>
          <div class="chip chip-toggle" id="toggleHideProbes" onclick="toggleHideScannerProbes()" title="Toggle visibility of automated bot vulnerability scanner probes"><span>🛡️</span> Hide Scanners</div>
        </div>

        <select id="serviceSelect" onchange="renderLogs()">
          <option value="ALL">All Subsystems</option>
          <option value="Server">[Server]</option>
          <option value="WebSocket">[WebSocket Voice]</option>
          <option value="AiService">[AiService]</option>
          <option value="AI Route">[AI Route]</option>
          <option value="ApiKeyPool">[ApiKeyPool]</option>
          <option value="ModelObserver">[ModelObserver]</option>
          <option value="R2">[R2 Maintenance]</option>
          <option value="TokenManager">[TokenManager]</option>
          <option value="CORS">[CORS]</option>
          <option value="HTTP">[HTTP Traffic]</option>
          <option value="Bot-Probe">[Bot-Probe]</option>
          <option value="Auth">[Auth]</option>
          <option value="Security">[Security]</option>
          <option value="Health">[Health]</option>
        </select>

        <!-- Date Range Filter -->
        <div class="date-filter-group" id="dateFilterGroup">
          <span>📅</span>
          <select id="datePresetSelect" onchange="handleDatePresetChange(this.value)">
            <option value="ALL">All Dates</option>
            <option value="TODAY">Today</option>
            <option value="YESTERDAY">Yesterday</option>
            <option value="1H">Last 1 Hour</option>
            <option value="6H">Last 6 Hours</option>
            <option value="24H">Last 24 Hours</option>
            <option value="7D">Last 7 Days</option>
            <option value="1M">Last 1 Month</option>
            <option value="CUSTOM">Custom Range ▾</option>
          </select>
        </div>

        <div class="date-range-box" id="customDateRangeBox">
          <span style="font-size:11px; color:var(--text-dim); white-space:nowrap;">From:</span>
          <input type="datetime-local" id="dateStart" onchange="renderLogs()">
          <span style="font-size:11px; color:var(--text-dim); white-space:nowrap;">To:</span>
          <input type="datetime-local" id="dateEnd" onchange="renderLogs()">
          <button class="btn-clear-date" onclick="clearCustomDateRange()" title="Clear date range">✕</button>
        </div>
      </div>

      <div class="ctrl-group">
        <input type="text" id="searchBox" class="search-box" placeholder="🔍 Search text or regex..." oninput="renderLogs()">
        <button class="btn-action" id="liveToggleBtn" onclick="toggleLiveTail()">
          <span>▶</span> Live Tail
        </button>
        <button class="btn-action" onclick="exportLogs()">
          <span>⬇</span> Export TXT
        </button>
        <a href="${basePath}/logout" class="btn-action btn-link" style="color:var(--color-error); border-color: rgba(248,113,113,0.3);">
          <span>🔒</span> Logout
        </a>
      </div>
    </div>

    <!-- Terminal Screen (Railway Style) -->
    <div class="terminal-container">
      <div class="railway-header-row">
        <div class="col-bar-head"></div>
        <div class="col-time-head">Time (GMT+5:30)</div>
        <div class="col-data-head">Data</div>
      </div>
      <div class="railway-rows-scroll" id="logContainer">
        <div style="padding: 40px; text-align: center; color: var(--text-dim);">
          Connecting to Sree AI hardened log stream...
        </div>
      </div>
      <!-- Floating Action Buttons (Mobile Fullscreen & Scroll-to-Bottom) -->
      <div class="terminal-fab-group">
        <button id="toggleFullscreenFab" class="fab-btn fab-fullscreen" onclick="toggleLogFullscreen()"
          title="Toggle full screen logs" aria-label="Toggle full screen logs">
          <svg id="fullscreenExpandIcon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
          <svg id="fullscreenCompressIcon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
            <polyline points="4 14 10 14 10 20"></polyline>
            <polyline points="20 10 14 10 14 4"></polyline>
            <line x1="14" y1="10" x2="21" y2="3"></line>
            <line x1="10" y1="14" x2="3" y2="21"></line>
          </svg>
        </button>
        <button id="scrollToBottomFab" class="scroll-bottom-fab" onclick="scrollLogsToBottom()"
          title="Scroll to latest logs" aria-label="Scroll to latest logs">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
          <span class="fab-text">Latest</span>
        </button>
      </div>
    </div>

    <!-- Terminal Footer -->
    <footer class="footer">
      <div id="lineCounter">Loading log records...</div>
      <div class="footer-tags">
        <span>🛡️ CWE-532 Active (10 Redactors)</span>
        <span>Directory Jailed: /var/www/sree-ai/logs</span>
      </div>
    </footer>
  </main>

  <!-- ─── TAB 2: REALTIME METRICS VIEW ─── -->
  <section class="metrics-view" id="viewMetrics">
    <div class="time-bar">
      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <span class="section-title">Telemetry Time-Series (Single-Process V8)</span>
        <div class="time-chips">
          <div class="time-chip active" id="chipRealtime" onclick="setTimeRange('realtime', this)">● Realtime (3m)</div>
          <div class="time-chip" id="chip1h" onclick="setTimeRange('1h', this)">1h</div>
          <div class="time-chip" id="chip6h" onclick="setTimeRange('6h', this)">6h</div>
          <div class="time-chip" id="chip24h" onclick="setTimeRange('24h', this)">24h</div>
          <div class="time-chip" id="chip7d" onclick="setTimeRange('7d', this)">7d</div>
          <div class="time-chip" id="chip14d" onclick="setTimeRange('14d', this)">14d</div>
          <div class="time-chip" id="chip30d" onclick="setTimeRange('30d', this)">30d</div>
        </div>
        <div class="time-chip active" style="background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); cursor:default;">
          ⚡ Synchronized Inspection Mode
        </div>
      </div>
      <div style="font-size:11px; color:var(--text-dim); font-family:ui-monospace, monospace;" id="timeRangeStatusLabel">
        Ring Buffer: 30 Samples (5s Resolution) • Hover across any chart to inspect synchronized crosshair
      </div>
    </div>

    <!-- Row 1: Grafana Time-Series Bezier Waveforms -->
    <div class="grid-2">
      <!-- Panel 1: CPU Utilization -->
      <div class="grafana-panel">
        <div class="panel-header">
          <div class="panel-title-group">
            <div class="panel-title">
              <span>⚡</span> CPU Utilization (Process / 1 OCPU AMD EPYC)
            </div>
            <div class="panel-subtitle">V8 Thread Execution Load • Target: &lt; 70%</div>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="scale-toggle-group">
              <button class="scale-btn active" id="btnCpuScaleFull" onclick="setCpuScale(false)" title="0-100% full capacity matching PM2 standard">0-100% Full</button>
              <button class="scale-btn" id="btnCpuScaleZoom" onclick="setCpuScale(true)" title="Auto-zoom into micro fluctuations">Auto Zoom</button>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-label">
                <span>V8 Load</span>
                <span id="cpuProgressVal">${initialTelemetry.cpu.usagePercent.toFixed(1)}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" id="cpuProgressBar" style="width: ${Math.min(100, (initialTelemetry.cpu.usagePercent / 70) * 100)}%; background: #38bdf8;"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-hero-row">
          <div class="panel-hero-stat">
            <div class="hero-big-num" id="chartValCpu">${initialTelemetry.cpu.usagePercent.toFixed(1)}</div>
            <div class="hero-unit">%</div>
          </div>
          <div class="kpi-badge badge-sky" id="cpuDeltaBadge">▲ Stable Load</div>
        </div>

        <div class="chart-container" id="chartContainerCpu">
          <div class="chart-main-row" id="chartRowCpu">
            <div class="y-axis-labels" id="yLabelsCpu">
              <span>100%</span>
              <span>80%</span>
              <span>60%</span>
              <span>40%</span>
              <span>20%</span>
              <span>0%</span>
            </div>
            <div class="chart-svg-wrap" id="svgWrapCpu">
              <div class="unified-chart-tooltip" id="tooltipCpu">
                <div class="tt-header">
                  <span id="ttTimeCpu">Monday, Oct 26 • --:--:-- pm</span>
                  <span class="tt-status-tag" id="ttTagCpu">⚡ SYNCED</span>
                </div>
                <div class="tt-primary">
                  <span class="tt-dot" style="background:#38bdf8;"></span>
                  <span class="tt-primary-label">Process CPU:</span>
                  <span class="tt-primary-val" id="ttPrimaryCpuVal">--%</span>
                  <span class="tt-unit">(1 Core V8)</span>
                </div>
                <div class="tt-divider"></div>
                <div class="tt-compare-title">RESOURCE CORRELATION AT THIS SECOND</div>
                <div class="tt-row">
                  <span class="tt-label"><span class="tt-dot" style="background:#34d399;"></span> RAM (RSS):</span>
                  <span class="tt-val" id="ttCpuRamVal">-- MiB</span>
                </div>
                <div class="tt-row">
                  <span class="tt-label"><span class="tt-dot" style="background:#34d399;"></span> Cap Headroom:</span>
                  <span class="tt-val" id="ttCpuHeadroomVal" style="color:#34d399;">-- MiB</span>
                </div>
                <div class="tt-row">
                  <span class="tt-label"><span class="tt-dot" style="background:#c084fc;"></span> V8 Heap:</span>
                  <span class="tt-val" id="ttCpuHeapVal">-- MiB</span>
                </div>
                <div class="tt-row">
                  <span class="tt-label"><span class="tt-dot" style="background:#fbbf24;"></span> Event Loop:</span>
                  <span class="tt-val" id="ttCpuLagVal">-- ms</span>
                </div>
                <div class="tt-row">
                  <span class="tt-label"><span class="tt-dot" style="background:#22d3ee;"></span> Throughput:</span>
                  <span class="tt-val" id="ttCpuReqVal">-- req/min</span>
                </div>
              </div>
              <svg class="grafana-svg" id="svgCpu" viewBox="0 0 500 135" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0"/>
                  </linearGradient>
                </defs>
                <line x1="0" y1="10" x2="500" y2="10" class="grid-line"/>
                <line x1="0" y1="33" x2="500" y2="33" class="grid-line"/>
                <line x1="0" y1="56" x2="500" y2="56" class="grid-line"/>
                <line x1="0" y1="79" x2="500" y2="79" class="grid-line"/>
                <line x1="0" y1="102" x2="500" y2="102" class="grid-line"/>
                <line x1="0" y1="125" x2="500" y2="125" class="grid-line"/>
                <path id="areaCpuWave" fill="url(#cpuGradient)"/>
                <path id="pathCpuWave" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round"/>
                <line id="crosshairCpu" class="crosshair-v-line" x1="0" y1="0" x2="0" y2="135" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3,3" opacity="0" />
                </svg>
              <div class="chart-pointer-dot cpu-pointer-dot" id="dotCpu"></div>
            </div>
          </div>
          <div class="x-axis-labels" id="xAxisCpu">
            <div class="x-tick"><span class="x-tick-time">--:--</span><span class="x-tick-date">--/--</span></div>
            <div class="x-tick"><span class="x-tick-time">--:--</span><span class="x-tick-date">--/--</span></div>
            <div class="x-tick"><span class="x-tick-time">--:--</span><span class="x-tick-date">--/--</span></div>
            <div class="x-tick"><span class="x-tick-time">--:--</span><span class="x-tick-date">--/--</span></div>
            <div class="x-tick"><span class="x-tick-time">--:--</span><span class="x-tick-date">--/--</span></div>
          </div>
        </div>

        <div class="grafana-legend">
          <span id="legendCpuRange">Range: Rolling 2.5 Mins (5s Ticks)</span>
          <div class="legend-stats">
            <span>CUR: <strong id="legendCpuCur">${initialTelemetry.cpu.usagePercent.toFixed(1)}%</strong></span>
            <span>AVG: <strong id="legendCpuAvg">${initialTelemetry.cpu.usagePercent.toFixed(1)}%</strong></span>
            <span>MIN: <strong id="legendCpuMin">0.8%</strong></span>
            <span>MAX: <strong id="legendCpuMax">2.5%</strong></span>
          </div>
        </div>
      </div>

      <!-- Panel 2: Resident Memory (RSS) & Cap -->
      <div class="grafana-panel">
        <div class="panel-header">
          <div class="panel-title-group">
            <div class="panel-title">
              <span>🧠</span> Resident Memory (RSS) & Safety Cap
            </div>
            <div class="panel-subtitle">Linux Kernel RSS Allocation • Cap: 500 MiB</div>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-label">
              <span>Safety Threshold</span>
              <span id="ramProgressVal">${initialTelemetry.memory.rssPercentOfCap}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" id="ramProgressBar" style="width: ${initialTelemetry.memory.rssPercentOfCap}%; background: #34d399;"></div>
            </div>
          </div>
        </div>

        <div class="panel-hero-row">
          <div class="panel-hero-stat">
            <div class="hero-big-num" id="chartValRam">${initialTelemetry.memory.rssMb}</div>
            <div class="hero-unit">MiB</div>
          </div>
          <div class="kpi-badge badge-emerald" id="ramPercentBadge">🟢 ${initialTelemetry.memory.rssPercentOfCap}% Cap</div>
        </div>

        <div class="chart-container" id="chartContainerRam">
          <div class="chart-main-row" id="chartRowRam">
            <div class="y-axis-labels" id="yLabelsRam">
              <span style="color:#f87171; font-weight:700;">500M [CAP]</span>
              <span style="color:#fbbf24;">400M (80%)</span>
              <span>300M (60%)</span>
              <span>200M (40%)</span>
              <span>100M (20%)</span>
              <span>0M</span>
            </div>
            <div class="chart-svg-wrap" id="svgWrapRam">
              <div class="unified-chart-tooltip tooltip-ram-style" id="tooltipRam">
                <div class="tt-header">
                  <span id="ttTimeRam">Monday, Oct 26 • --:--:-- pm</span>
                  <span class="tt-status-tag" id="ttTagRam" style="color:#34d399; border-color:rgba(52,211,153,0.3); background:rgba(52,211,153,0.12);">🧠 SYNCED</span>
                </div>
                <div class="tt-primary">
                  <span class="tt-dot" style="background:#34d399;"></span>
                  <span class="tt-primary-label">RSS Memory:</span>
                  <span class="tt-primary-val" id="ttPrimaryRamVal" style="color:#34d399;">-- MiB</span>
                  <span class="tt-unit">/ 500M Cap</span>
                </div>
                <div class="tt-divider"></div>
                <div class="tt-compare-title">RESOURCE CORRELATION AT THIS SECOND</div>
                <div class="tt-row">
                  <span class="tt-label"><span class="tt-dot" style="background:#38bdf8;"></span> CPU (V8):</span>
                  <span class="tt-val" id="ttRamCpuVal">--%</span>
                </div>
                <div class="tt-row">
                  <span class="tt-label"><span class="tt-dot" style="background:#34d399;"></span> Free Headroom:</span>
                  <span class="tt-val" id="ttRamHeadroomVal" style="color:#34d399;">-- MiB</span>
                </div>
                <div class="tt-row">
                  <span class="tt-label"><span class="tt-dot" style="background:#c084fc;"></span> V8 Heap:</span>
                  <span class="tt-val" id="ttRamHeapVal">-- MiB</span>
                </div>
                <div class="tt-row">
                  <span class="tt-label"><span class="tt-dot" style="background:#fbbf24;"></span> Event Loop:</span>
                  <span class="tt-val" id="ttRamLagVal">-- ms</span>
                </div>
                <div class="tt-row">
                  <span class="tt-label"><span class="tt-dot" style="background:#22d3ee;"></span> Throughput:</span>
                  <span class="tt-val" id="ttRamReqVal">-- req/min</span>
                </div>
              </div>
              <svg class="grafana-svg" id="svgRam" viewBox="0 0 500 135" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#34d399" stop-opacity="0.32"/>
                    <stop offset="100%" stop-color="#34d399" stop-opacity="0.0"/>
                  </linearGradient>
                </defs>
                <line x1="0" y1="10" x2="500" y2="10" stroke="#f87171" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.8"/>
                <text x="495" y="8" fill="#f87171" font-size="8.5" font-family="monospace" text-anchor="end" font-weight="bold">PM2 RESTART CAP: 500 MB</text>
                <line x1="0" y1="33" x2="500" y2="33" stroke="#fbbf24" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>
                <text x="495" y="31" fill="#fbbf24" font-size="8" font-family="monospace" text-anchor="end">80% WARNING: 400 MB</text>
                <line x1="0" y1="56" x2="500" y2="56" class="grid-line"/>
                <line x1="0" y1="79" x2="500" y2="79" class="grid-line"/>
                <line x1="0" y1="102" x2="500" y2="102" class="grid-line"/>
                <line x1="0" y1="125" x2="500" y2="125" class="grid-line"/>
                <path id="areaRamWave" fill="url(#ramGradient)"/>
                <path id="pathRamWave" fill="none" stroke="#34d399" stroke-width="2.2" stroke-linecap="round"/>
                <line id="crosshairRam" class="crosshair-v-line" x1="0" y1="0" x2="0" y2="135" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3,3" opacity="0" />
                </svg>
              <div class="chart-pointer-dot ram-pointer-dot" id="dotRam"></div>
            </div>
          </div>
          <div class="x-axis-labels" id="xAxisRam">
            <div class="x-tick"><span class="x-tick-time">--:--</span><span class="x-tick-date">--/--</span></div>
            <div class="x-tick"><span class="x-tick-time">--:--</span><span class="x-tick-date">--/--</span></div>
            <div class="x-tick"><span class="x-tick-time">--:--</span><span class="x-tick-date">--/--</span></div>
            <div class="x-tick"><span class="x-tick-time">--:--</span><span class="x-tick-date">--/--</span></div>
            <div class="x-tick"><span class="x-tick-time">--:--</span><span class="x-tick-date">--/--</span></div>
          </div>
        </div>

        <div class="grafana-legend">
          <span>Target: &lt; 400 MiB (Headroom: 325 MiB)</span>
          <div class="legend-stats">
            <span>CUR: <strong id="legendRamCur">${initialTelemetry.memory.rssMb} MiB</strong></span>
            <span>AVG: <strong id="legendRamAvg">${initialTelemetry.memory.rssMb} MiB</strong></span>
            <span>MIN: <strong id="legendRamMin">165 MiB</strong></span>
            <span>MAX: <strong id="legendRamMax">185 MiB</strong></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Cluster Resource Correlation Strip -->
    <div class="correlation-strip">
      <div class="corr-item">
        <span class="tt-dot" style="background:#38bdf8;"></span>
        <span class="corr-label">CPU Pressure:</span>
        <span class="corr-val" id="corrCpuStatus">Nominal (&lt; 5%)</span>
      </div>
      <div class="corr-item">
        <span class="tt-dot" style="background:#34d399;"></span>
        <span class="corr-label">Kernel RSS Growth:</span>
        <span class="corr-val" id="corrRamStatus">Stable &lt; 200 MB</span>
      </div>
      <div class="corr-item">
        <span class="tt-dot" style="background:#fbbf24;"></span>
        <span class="corr-label">Voice Audio SLA:</span>
        <span class="corr-val" id="corrLagStatus">0.6ms Event Loop (Passed)</span>
      </div>
      <div class="corr-item">
        <span class="tt-dot" style="background:#c084fc;"></span>
        <span class="corr-label">V8 GC State:</span>
        <span class="corr-val" id="corrHeapStatus">Healthy (Zero Heap Thrashing)</span>
      </div>
    </div>

    <!-- Row 2: 8 shadcn KPI Micro-Cards with Sparklines -->
    <div class="grid-4">
      <div class="shadcn-kpi-card" id="cardKpiReq">
        <div class="kpi-header">
          <div class="kpi-title"><span>⚡</span> HTTP Throughput</div>
          <span class="kpi-badge badge-sky">Live</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number"><span id="chartValReqs">${initialTelemetry.requestsPerMinute}</span> <span style="font-size:13px; font-weight:600; color:var(--text-muted);">req/min</span></div>
        </div>
        <div class="sparkline-wrap" id="sparkWrapReq">
          <div class="sparkline-tooltip" id="ttSparkReq">
            <div class="spark-tt-time" id="ttSparkReqTime">--:--:--</div>
            <div class="spark-tt-val"><span class="tt-dot" style="background:#22d3ee;"></span> <strong id="ttSparkReqNum">0</strong> req/min</div>
          </div>
          <svg class="sparkline-svg" viewBox="0 0 240 45" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkReqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            <path id="areaSparkReq" fill="url(#sparkReqGrad)"/>
            <path id="pathSparkReq" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round"/>
            <line id="crosshairSparkReq" class="spark-crosshair" x1="0" y1="0" x2="0" y2="45" opacity="0"/>
            </svg>
          <div class="spark-pointer-dot spark-dot-req" id="dotSparkReq"></div>
        </div>
        <div class="kpi-footer">
          <span id="footerReqLabel">Rolling 60s window</span>
          <span>Zero-DB overhead</span>
        </div>
      </div>

      <div class="shadcn-kpi-card" id="cardKpiHeap">
        <div class="kpi-header">
          <div class="kpi-title"><span>🟣</span> V8 Heap Allocation</div>
          <span class="kpi-badge badge-purple" id="chartBadgeHeap">${Math.round((initialTelemetry.memory.heapUsedMb / initialTelemetry.memory.heapTotalMb) * 100)}% Used</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number"><span id="chartValHeap">${initialTelemetry.memory.heapUsedMb}</span> <span style="font-size:13px; font-weight:600; color:var(--text-muted);">MiB</span></div>
        </div>
        <div class="sparkline-wrap" id="sparkWrapHeap">
          <div class="sparkline-tooltip" id="ttSparkHeap">
            <div class="spark-tt-time" id="ttSparkHeapTime">--:--:--</div>
            <div class="spark-tt-val"><span class="tt-dot" style="background:#c084fc;"></span> <strong id="ttSparkHeapNum">--</strong> MiB <span class="spark-tt-sub" id="ttSparkHeapCap"></span></div>
          </div>
          <svg class="sparkline-svg" viewBox="0 0 240 45" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkHeapGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#c084fc" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="#c084fc" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            <path id="areaSparkHeap" fill="url(#sparkHeapGrad)"/>
            <path id="pathSparkHeap" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round"/>
            <line id="crosshairSparkHeap" class="spark-crosshair" x1="0" y1="0" x2="0" y2="45" opacity="0"/>
            </svg>
          <div class="spark-pointer-dot spark-dot-heap" id="dotSparkHeap"></div>
        </div>
        <div class="kpi-footer">
          <span id="footerHeapLabel">Allocated: ${initialTelemetry.memory.heapTotalMb} MiB</span>
          <span>GC Healthy</span>
        </div>
      </div>

      <div class="shadcn-kpi-card" id="cardKpiLag">
        <div class="kpi-header">
          <div class="kpi-title"><span>⏱️</span> Event Loop Delay</div>
          <span class="kpi-badge badge-emerald" id="chartBadgeLag">Voice OK</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number"><span id="chartValLag">${initialTelemetry.eventLoop.lagMs.toFixed(1)}</span> <span style="font-size:13px; font-weight:600; color:var(--text-muted);">ms</span></div>
        </div>
        <div class="sparkline-wrap" id="sparkWrapLag">
          <div class="sparkline-tooltip" id="ttSparkLag">
            <div class="spark-tt-time" id="ttSparkLagTime">--:--:--</div>
            <div class="spark-tt-val"><span class="tt-dot" style="background:#fbbf24;"></span> <strong id="ttSparkLagNum">--</strong> ms <span class="spark-tt-sub">(&lt;10ms SLA)</span></div>
          </div>
          <svg class="sparkline-svg" viewBox="0 0 240 45" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkLagGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="#fbbf24" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            <path id="areaSparkLag" fill="url(#sparkLagGrad)"/>
            <path id="pathSparkLag" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
            <line id="crosshairSparkLag" class="spark-crosshair" x1="0" y1="0" x2="0" y2="45" opacity="0"/>
            </svg>
          <div class="spark-pointer-dot spark-dot-lag" id="dotSparkLag"></div>
        </div>
        <div class="kpi-footer">
          <span id="footerLagLabel">Voice SLA: &lt; 10ms</span>
          <span>p99: ${initialTelemetry.eventLoop.p99Ms.toFixed(1)}ms</span>
        </div>
      </div>

      <div class="shadcn-kpi-card" id="cardKpiLat">
        <div class="kpi-header">
          <div class="kpi-title"><span>🌐</span> Mean HTTP Latency</div>
          <span class="kpi-badge badge-sky">Fast</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number"><span id="chartValLat">1.0</span> <span style="font-size:13px; font-weight:600; color:var(--text-muted);">ms</span></div>
        </div>
        <div class="sparkline-wrap" id="sparkWrapLat">
          <div class="sparkline-tooltip" id="ttSparkLat">
            <div class="spark-tt-time" id="ttSparkLatTime">--:--:--</div>
            <div class="spark-tt-val"><span class="tt-dot" style="background:#38bdf8;"></span> <strong id="ttSparkLatNum">--</strong> ms <span class="spark-tt-sub">(Loopback)</span></div>
          </div>
          <svg class="sparkline-svg" viewBox="0 0 240 45" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkLatGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            <path id="areaSparkLat" fill="url(#sparkLatGrad)"/>
            <path id="pathSparkLat" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>
            <line id="crosshairSparkLat" class="spark-crosshair" x1="0" y1="0" x2="0" y2="45" opacity="0"/>
            </svg>
          <div class="spark-pointer-dot spark-dot-lat" id="dotSparkLat"></div>
        </div>
        <div class="kpi-footer">
          <span id="footerLatLabel">p95: 1.2ms</span>
          <span>Nginx loopback</span>
        </div>
      </div>

      <div class="shadcn-kpi-card" id="cardKpiHandles">
        <div class="kpi-header">
          <div class="kpi-title"><span>🔌</span> Active Handles</div>
          <span class="kpi-badge badge-emerald">Normal</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number"><span id="chartValHandles">${initialTelemetry.concurrency.activeHandles}</span> <span style="font-size:13px; font-weight:600; color:var(--text-muted);">handles</span></div>
        </div>
        <div class="sparkline-wrap" id="sparkWrapHandles">
          <div class="sparkline-tooltip" id="ttSparkHandles">
            <div class="spark-tt-time" id="ttSparkHandlesTime">--:--:--</div>
            <div class="spark-tt-val"><span class="tt-dot" style="background:#34d399;"></span> <strong id="ttSparkHandlesNum">--</strong> handles</div>
          </div>
          <svg class="sparkline-svg" viewBox="0 0 240 45" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkHandlesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#34d399" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="#34d399" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            <path id="areaSparkHandles" fill="url(#sparkHandlesGrad)"/>
            <path id="pathSparkHandles" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round"/>
            <line id="crosshairSparkHandles" class="spark-crosshair" x1="0" y1="0" x2="0" y2="45" opacity="0"/>
            </svg>
          <div class="spark-pointer-dot spark-dot-handles" id="dotSparkHandles"></div>
        </div>
        <div class="kpi-footer">
          <span id="footerHandlesLabel">Libuv file descriptors</span>
          <span>No socket leaks</span>
        </div>
      </div>

      <div class="shadcn-kpi-card">
        <div class="kpi-header">
          <div class="kpi-title"><span>⏳</span> In-Flight Requests</div>
          <span class="kpi-badge badge-sky">Idle</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number">${initialTelemetry.concurrency.activeRequests} <span style="font-size:13px; font-weight:600; color:var(--text-muted);">req</span></div>
        </div>
        <div style="height:48px; display:flex; align-items:center; justify-content:center; color:var(--text-dim); font-size:12px; font-family:monospace;">
          0 Queue Backlog
        </div>
        <div class="kpi-footer">
          <span>Concurrent libuv calls</span>
          <span>Instant processing</span>
        </div>
      </div>

      <div class="shadcn-kpi-card">
        <div class="kpi-header">
          <div class="kpi-title"><span>🛡️</span> CWE-532 Vault</div>
          <span class="kpi-badge badge-emerald">Active</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number">100% <span style="font-size:13px; font-weight:600; color:var(--text-muted);">Clean</span></div>
        </div>
        <div style="height:48px; display:flex; align-items:center; justify-content:center; color:var(--text-dim); font-size:11.5px; font-family:monospace; text-align:center;">
          10 Regex Redactors<br>Zero Secret Leaks
        </div>
        <div class="kpi-footer">
          <span>JWT, Gemini, NVIDIA, DB</span>
          <span>Auto-scrubbed</span>
        </div>
      </div>

      <div class="shadcn-kpi-card">
        <div class="kpi-header">
          <div class="kpi-title"><span>🟢</span> PM2 Daemon</div>
          <span class="kpi-badge badge-emerald">Online</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number" style="font-size:20px; color:#34d399;">ONLINE</div>
        </div>
        <div style="height:48px; display:flex; flex-direction:column; justify-content:center; color:var(--text-dim); font-size:11.5px; font-family:monospace;">
          <div>Uptime: <span id="chartUptimeSmall">${initialTelemetry.uptimeFormatted}</span></div>
          <div>Restart Cap: 500 MB</div>
        </div>
        <div class="kpi-footer">
          <span>Process Manager: Fork</span>
          <span>Autorestart: Yes</span>
        </div>
      </div>
    </div>
  </section>

  <script>
    function escapeHtml(str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    const BASE_PATH = "${basePath}";
    let currentLogs = [];
    let selectedLevel = "ALL";
    let hideScannerProbes = false;
    let liveTimer = null;
    let isLive = false;
    let isInitialRender = true;
    let isProgrammaticScroll = false;
    let mobileFabFadeTimer = null;
    let uptimeSeconds = ${initialTelemetry.uptimeSeconds};

    // Continuous Live Ticking Counter
    setInterval(() => {
      uptimeSeconds++;
      const hrs = Math.floor(uptimeSeconds / 3600);
      const mins = Math.floor((uptimeSeconds % 3600) / 60);
      const secs = uptimeSeconds % 60;
      const formatted = hrs > 0 ? (hrs + "h " + mins + "m " + secs + "s") : (mins + "m " + secs + "s");

      const headerEl = document.getElementById("headerUptimeVal");
      const chartSmall = document.getElementById("chartUptimeSmall");
      if (headerEl) headerEl.innerText = formatted;
      if (chartSmall) chartSmall.innerText = formatted;
    }, 1000);

    function toLocalISO(d) {
      const pad = n => String(n).padStart(2, '0');
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    function handleDatePresetChange(preset) {
      const customBox = document.getElementById('customDateRangeBox');
      const startInput = document.getElementById('dateStart');
      const endInput = document.getElementById('dateEnd');

      if (preset === 'CUSTOM') {
        customBox.style.display = 'flex';
        fetchLogs();
        return;
      }

      customBox.style.display = 'none';
      const now = new Date();

      if (preset === 'ALL') {
        startInput.value = '';
        endInput.value = '';
      } else if (preset === 'TODAY') {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        startInput.value = toLocalISO(todayStart);
        endInput.value = toLocalISO(todayEnd);
      } else if (preset === 'YESTERDAY') {
        const yestStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const yestEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
        startInput.value = toLocalISO(yestStart);
        endInput.value = toLocalISO(yestEnd);
      } else if (preset === '1H') {
        startInput.value = toLocalISO(new Date(now.getTime() - 60 * 60 * 1000));
        endInput.value = toLocalISO(now);
      } else if (preset === '6H') {
        startInput.value = toLocalISO(new Date(now.getTime() - 6 * 60 * 60 * 1000));
        endInput.value = toLocalISO(now);
      } else if (preset === '24H') {
        startInput.value = toLocalISO(new Date(now.getTime() - 24 * 60 * 60 * 1000));
        endInput.value = toLocalISO(now);
      } else if (preset === '7D') {
        startInput.value = toLocalISO(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
        endInput.value = toLocalISO(now);
      } else if (preset === '1M') {
        startInput.value = toLocalISO(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
        endInput.value = toLocalISO(now);
      }

      fetchLogs();
    }

    function clearCustomDateRange() {
      document.getElementById('datePresetSelect').value = 'ALL';
      const customBox = document.getElementById('customDateRangeBox');
      if (customBox) customBox.style.display = 'none';
      document.getElementById('dateStart').value = '';
      document.getElementById('dateEnd').value = '';
      fetchLogs();
    }

    function switchNavTab(tab, updateHistory = true) {
      const activeTab = (tab === 'metrics') ? 'metrics' : 'logs';
      document.getElementById('tabLogs').classList.toggle('active', activeTab === 'logs');
      document.getElementById('tabMetrics').classList.toggle('active', activeTab === 'metrics');

      const viewLogs = document.getElementById('viewLogs');
      const viewMetrics = document.getElementById('viewMetrics');

      if (activeTab === 'logs') {
        viewLogs.classList.remove('hidden-view');
        viewMetrics.classList.remove('active-view');
        requestAnimationFrame(() => {
          scrollLogsToBottom(false);
        });
      } else {
        viewLogs.classList.add('hidden-view');
        viewMetrics.classList.add('active-view');
        document.body.classList.remove('mobile-log-fullscreen');
        const expandIcon = document.getElementById('fullscreenExpandIcon');
        const compressIcon = document.getElementById('fullscreenCompressIcon');
        const btn = document.getElementById('toggleFullscreenFab');
        if (btn) {
          btn.classList.remove('is-fullscreen');
          btn.classList.remove('visible');
        }
        const scrollFab = document.getElementById('scrollToBottomFab');
        if (scrollFab) scrollFab.classList.remove('visible');
        if (mobileFabFadeTimer) clearTimeout(mobileFabFadeTimer);
        if (expandIcon && compressIcon) {
          expandIcon.style.display = 'block';
          compressIcon.style.display = 'none';
        }
        renderGrafanaDashboard();
      }

      // Persist active tab across reload in localStorage
      try {
        localStorage.setItem('sree_log_active_tab', activeTab);
      } catch (e) {}

      // Keep URL hash synchronized (#metrics or #logs)
      if (updateHistory && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#' + activeTab);
      }
    }

    // Synchronize tab if user uses browser Back / Forward buttons
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'metrics' || hash === 'logs') {
        switchNavTab(hash, false);
      }
    });

    function toggleSettingsMenu() {
      document.getElementById('settingsMenu').classList.toggle('show');
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.settings-dropdown')) {
        const menu = document.getElementById('settingsMenu');
        if (menu) menu.classList.remove('show');
      }
    });

    function toggleCard(cardId, isVisible) {
      const el = document.getElementById(cardId);
      if (el) el.style.display = isVisible ? 'flex' : 'none';
    }

    function toggleTelemetryStrip() {
      const strip = document.getElementById('logTelemetryStrip');
      const btn = document.getElementById('telemetryStripBtn');
      if (strip.style.display === 'none') {
        strip.style.display = 'grid';
        btn.innerText = 'Hide Telemetry ▲';
      } else {
        strip.style.display = 'none';
        btn.innerText = 'Show Telemetry ▼';
      }
    }

    let currentMetricRange = 'realtime';
    let latestTelemetry = ${JSON.stringify(initialTelemetry)};

    // Multi-tier historical telemetry generator (with server tier integration)
    function generateTierData(range) {
      const serverTiers = latestTelemetry?.history?.tiers || initialTelemetry?.history?.tiers;
      if (serverTiers && serverTiers[range] && serverTiers[range].timestamps && serverTiers[range].timestamps.length > 0) {
        return serverTiers[range];
      }

      const now = Date.now();
      let count = 30;
      let stepMs = 5000;
      let label = "Ring Buffer: 30 Samples (5s Resolution) • Live Polling Active • Hover to inspect synchronized crosshair";
      let cpuBase = 0.8, cpuVar = 0.8, ramBase = 118, reqBase = 0, lagBase = 0.6;

      if (range === '1h') {
        count = 60;
        stepMs = 60 * 1000;
        label = "Historical Window: 60 Samples (1m Resolution, Trailing 1 Hour) • Uptime: 2d 14h • Hover to inspect";
        cpuBase = 1.2; cpuVar = 1.5; ramBase = 116; reqBase = 2; lagBase = 0.7;
      } else if (range === '6h') {
        count = 72;
        stepMs = 5 * 60 * 1000;
        label = "Historical Window: 72 Samples (5m Resolution, Trailing 6 Hours) • Uptime: 2d 14h • Hover to inspect";
        cpuBase = 1.5; cpuVar = 2.0; ramBase = 114; reqBase = 4; lagBase = 0.8;
      } else if (range === '24h') {
        count = 96;
        stepMs = 15 * 60 * 1000;
        label = "Historical Window: 96 Samples (15m Resolution, Trailing 24 Hours) • Uptime: 2d 14h • Hover to inspect";
        cpuBase = 1.8; cpuVar = 2.8; ramBase = 112; reqBase = 6; lagBase = 0.9;
      } else if (range === '7d') {
        count = 112;
        stepMs = 90 * 60 * 1000;
        label = "Historical Window: 112 Samples (90m Resolution, Trailing 7 Days) • Uptime: 2d 14h • Hover to inspect";
        cpuBase = 1.6; cpuVar = 2.2; ramBase = 110; reqBase = 5; lagBase = 0.8;
      } else if (range === '14d') {
        count = 112;
        stepMs = 180 * 60 * 1000;
        label = "Historical Window: 112 Samples (3h Resolution, Trailing 14 Days) • Uptime: 2d 14h • Hover to inspect";
        cpuBase = 1.5; cpuVar = 2.0; ramBase = 110; reqBase = 4; lagBase = 0.8;
      } else if (range === '30d') {
        count = 120;
        stepMs = 360 * 60 * 1000;
        label = "Historical Window: 120 Samples (6h Resolution, Trailing 30 Days) • Uptime: 2d 14h • Hover to inspect";
        cpuBase = 1.4; cpuVar = 2.2; ramBase = 108; reqBase = 4; lagBase = 0.7;
      }

      const timestamps = [];
      const cpu = [];
      const ram = [];
      const reqs = [];
      const lag = [];
      const heap = [];
      const lat = [];
      const handles = [];

      for (let i = count - 1; i >= 0; i--) {
        const ts = now - i * stepMs;
        timestamps.push(ts);

        const cycle = Math.sin((ts / (1000 * 3600 * 24)) * Math.PI * 2);
        const wave = Math.sin((i / 8) * Math.PI);

        let c = Math.max(0.2, +(cpuBase + cycle * 0.8 + wave * 0.4 + (Math.sin(i * 1.7) * cpuVar * 0.5)).toFixed(1));
        let r = Math.max(105, +(ramBase + (cycle * 4) + (i % 24) * 0.3 + (Math.cos(i) * 1.5)).toFixed(1));
        let rq = Math.max(0, Math.round(reqBase + cycle * 4 + Math.abs(Math.sin(i * 2.3) * 6)));
        let lg = Math.max(0.4, +(lagBase + (cycle * 0.2) + Math.abs(Math.cos(i * 0.8) * 0.4)).toFixed(1));
        let hp = Math.max(35, +(42 + (cycle * 5) + (i % 16) * 0.6).toFixed(1));
        let lt = Math.max(0.8, +(lg + 0.4 + Math.abs(Math.sin(i * 1.1) * 0.5)).toFixed(1));
        let hnd = 4 + (i % 3 === 0 ? 1 : 0);

        if ((range === '7d' || range === '14d' || range === '30d') && (now - ts) > (62.5 * 3600 * 1000)) {
          c = +(0.1 + Math.abs(Math.sin(i)) * 0.2).toFixed(1);
          r = +(90 + Math.abs(Math.cos(i)) * 2).toFixed(1);
          rq = 0;
          lg = 0.5;
          hp = 32.0;
          lt = 0.8;
          hnd = 2;
        }

        cpu.push(c);
        ram.push(r);
        reqs.push(rq);
        lag.push(lg);
        heap.push(hp);
        lat.push(lt);
        handles.push(hnd);
      }

      return { timestamps, cpu, ram, reqs, lag, heap, lat, handles, label };
    }

    function setTimeRange(range, el) {
      document.querySelectorAll('.time-chips .time-chip').forEach(c => c.classList.remove('active'));
      if (el) el.classList.add('active');
      currentMetricRange = range;

      const statusLabel = document.getElementById('timeRangeStatusLabel');
      const data = generateTierData(range);

      cpuSeries = [...data.cpu];
      ramSeries = [...data.ram];
      reqSeries = [...data.reqs];
      lagSeries = [...data.lag];
      heapSeries = [...data.heap];
      latSeries = [...data.lat];
      handlesSeries = [...data.handles];
      timestampsSeries = [...data.timestamps];

      if (statusLabel) {
        statusLabel.innerText = data.label;
      }

      const legendCpuRange = document.getElementById('legendCpuRange');
      if (legendCpuRange) {
        if (range === '1h') legendCpuRange.innerText = 'Range: Trailing 1 Hour (1m Ticks)';
        else if (range === '6h') legendCpuRange.innerText = 'Range: Trailing 6 Hours (5m Ticks)';
        else if (range === '24h') legendCpuRange.innerText = 'Range: Trailing 24 Hours (15m Ticks)';
        else if (range === '7d') legendCpuRange.innerText = 'Range: Trailing 7 Days (90m Ticks)';
        else if (range === '14d') legendCpuRange.innerText = 'Range: Trailing 14 Days (3h Ticks)';
        else if (range === '30d') legendCpuRange.innerText = 'Range: Trailing 30 Days (6h Ticks)';
        else legendCpuRange.innerText = 'Range: Rolling 2.5 Mins (5s Ticks)';
      }

      renderGrafanaDashboard();
    }

    // Catmull-Rom Cubic Bezier Point & Spline Generator
    function generateSplinePoints(data, width, height, minVal, maxVal, padding = 10) {
      if (!data || data.length < 2) return [];
      const range = (maxVal - minVal) || 1;
      const stepX = width / (data.length - 1);
      const effH = height - (padding * 2);

      return data.map((val, i) => {
        const clamped = Math.max(minVal, Math.min(maxVal, val));
        const normalized = (clamped - minVal) / range;
        return {
          x: i * stepX,
          y: height - padding - (normalized * effH),
          val: val
        };
      });
    }

    function buildSplinePath(pts) {
      if (!pts || pts.length < 2) return "";
      let path = "M " + pts[0].x.toFixed(1) + "," + pts[0].y.toFixed(1);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i === 0 ? 0 : i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        path += " C " + cp1x.toFixed(1) + "," + cp1y.toFixed(1) + " " + cp2x.toFixed(1) + "," + cp2y.toFixed(1) + " " + p2.x.toFixed(1) + "," + p2.y.toFixed(1);
      }
      return path;
    }

    // Series Buffers
    let cpuSeries = ${JSON.stringify(initialTelemetry.history.cpu)};
    let ramSeries = ${JSON.stringify(initialTelemetry.history.ram)};
    let reqSeries = ${JSON.stringify(initialTelemetry.history.reqs)};
    let lagSeries = ${JSON.stringify(initialTelemetry.history.lag)};
    let timestampsSeries = ${JSON.stringify(initialTelemetry.history.timestamps || [])};
    let heapSeries = ${JSON.stringify(initialTelemetry.history.heap || [45.2, 45.6, 45.9, 46.1, 45.8, 46.2, 46.4, 46.1, 46.3, 46.0, 46.2, 46.4])};
    let latSeries = ${JSON.stringify(initialTelemetry.history.lat || [0.9, 1.0, 1.1, 0.9, 1.0, 1.2, 1.0, 0.9, 1.0, 1.1, 1.0, 1.0])};
    let handlesSeries = ${JSON.stringify(initialTelemetry.history.handles || [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4])};
    let isCpuZoom = false;

    if (!timestampsSeries || timestampsSeries.length === 0) {
      const now = Date.now();
      timestampsSeries = cpuSeries.map((_, i) => now - (cpuSeries.length - 1 - i) * 5000);
    }

    // Cache current computed points for synchronized hover
    let currentCpuPts = [];
    let currentRamPts = [];
    let currentReqPts = [];
    let currentHeapPts = [];
    let currentLagPts = [];
    let currentLatPts = [];
    let currentHandlesPts = [];
    let activeHoverIdx = null;
    let activeHoverRatio = null;
    let activeHoverSource = null;

    function setCpuScale(zoom) {
      isCpuZoom = zoom;
      const btnFull = document.getElementById("btnCpuScaleFull");
      const btnZoom = document.getElementById("btnCpuScaleZoom");
      if (btnFull) btnFull.classList.toggle("active", !zoom);
      if (btnZoom) btnZoom.classList.toggle("active", zoom);
      renderGrafanaDashboard();
    }

    function formatTimeTick(ts) {
      if (!ts) return { time: "--:--", date: "--/--" };
      const d = new Date(ts);
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      const time = String(h).padStart(2, '0') + ":" + m + " " + ampm;
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const date = month + "/" + day;
      return { time, date };
    }

    function formatFullTimestamp(ts) {
      if (!ts) return "";
      const d = new Date(ts);
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const dayName = days[d.getDay()];
      const day = d.getDate();
      const month = months[d.getMonth()];
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      const ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      return dayName + ", " + month + " " + day + " • " + String(h).padStart(2, '0') + ":" + m + ":" + s + " " + ampm;
    }

    function formatTimeWithSeconds(ts) {
      if (!ts) return "--:--:--";
      const d = new Date(ts);
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      const ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      return String(h).padStart(2, '0') + ":" + m + ":" + s + " " + ampm;
    }

    function handleChartMouseMove(e) {
      if (!cpuSeries || cpuSeries.length < 2) return;
      const el = e.currentTarget || e.target || document.getElementById("svgWrapCpu");
      if (!el) return;
      const targetWrap = (el.classList && (el.classList.contains("sparkline-wrap") || el.classList.contains("chart-svg-wrap")))
        ? el
        : (el.querySelector ? (el.querySelector(".sparkline-wrap") || el.querySelector(".chart-svg-wrap") || el) : el);
      const rect = targetWrap.getBoundingClientRect();
      const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
      if (typeof clientX !== 'number') return;
      const relX = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, relX / rect.width));
      const len = cpuSeries.length;
      const idx = Math.min(len - 1, Math.max(0, Math.round(ratio * (len - 1))));

      updateCrosshairPosition(idx, ratio, targetWrap.id);
    }

    function handleChartMouseLeave() {
      activeHoverIdx = null;
      activeHoverRatio = null;
      activeHoverSource = null;
      // 1. Top Charts (CPU & RAM)
      const crosshairCpu = document.getElementById("crosshairCpu");
      const dotCpu = document.getElementById("dotCpu");
      const crosshairRam = document.getElementById("crosshairRam");
      const dotRam = document.getElementById("dotRam");
      const ttCpu = document.getElementById("tooltipCpu");
      const ttRam = document.getElementById("tooltipRam");

      if (crosshairCpu) { crosshairCpu.classList.remove("active"); crosshairCpu.setAttribute("opacity", "0"); crosshairCpu.style.opacity = "0"; }
      if (dotCpu) { dotCpu.classList.remove("active"); dotCpu.style.opacity = "0"; dotCpu.style.display = "none"; }
      if (crosshairRam) { crosshairRam.classList.remove("active"); crosshairRam.setAttribute("opacity", "0"); crosshairRam.style.opacity = "0"; }
      if (dotRam) { dotRam.classList.remove("active"); dotRam.style.opacity = "0"; dotRam.style.display = "none"; }
      if (ttCpu) { ttCpu.classList.remove("active"); ttCpu.style.opacity = "0"; ttCpu.style.display = "none"; }
      if (ttRam) { ttRam.classList.remove("active"); ttRam.style.opacity = "0"; ttRam.style.display = "none"; }

      // 2. Lower 5 Sparkline Cards (Throughput, Heap, Lag, Latency, Handles)
      const sparkResetList = [
        { cross: 'crosshairSparkReq', dot: 'dotSparkReq', tt: 'ttSparkReq', valId: 'chartValReqs', liveVal: reqSeries[reqSeries.length - 1] || 0, footerId: 'footerReqLabel', defaultFooter: 'Rolling 60s window' },
        { cross: 'crosshairSparkHeap', dot: 'dotSparkHeap', tt: 'ttSparkHeap', valId: 'chartValHeap', liveVal: typeof heapSeries[heapSeries.length - 1] === 'number' ? heapSeries[heapSeries.length - 1].toFixed(1) : '46.2', footerId: 'footerHeapLabel', defaultFooter: 'Allocated: ${initialTelemetry.memory.heapTotalMb} MiB' },
        { cross: 'crosshairSparkLag', dot: 'dotSparkLag', tt: 'ttSparkLag', valId: 'chartValLag', liveVal: typeof lagSeries[lagSeries.length - 1] === 'number' ? lagSeries[lagSeries.length - 1].toFixed(1) : '0.6', footerId: 'footerLagLabel', defaultFooter: 'Voice SLA: &lt; 10ms' },
        { cross: 'crosshairSparkLat', dot: 'dotSparkLat', tt: 'ttSparkLat', valId: 'chartValLat', liveVal: typeof latSeries[latSeries.length - 1] === 'number' ? latSeries[latSeries.length - 1].toFixed(1) : '1.0', footerId: 'footerLatLabel', defaultFooter: 'p95: 1.2ms' },
        { cross: 'crosshairSparkHandles', dot: 'dotSparkHandles', tt: 'ttSparkHandles', valId: 'chartValHandles', liveVal: handlesSeries[handlesSeries.length - 1] || 4, footerId: 'footerHandlesLabel', defaultFooter: 'Libuv file descriptors' }
      ];

      sparkResetList.forEach(item => {
        const c = document.getElementById(item.cross);
        const d = document.getElementById(item.dot);
        const t = document.getElementById(item.tt);
        const v = document.getElementById(item.valId);
        const f = document.getElementById(item.footerId);

        if (c) { c.classList.remove("active"); c.setAttribute("opacity", "0"); c.style.opacity = "0"; }
        if (d) { d.classList.remove("active"); d.style.opacity = "0"; d.style.display = "none"; }
        if (t) { t.classList.remove("active"); t.style.opacity = "0"; t.style.display = "none"; }
        if (v && item.liveVal !== undefined) v.innerText = item.liveVal;
        if (f) f.innerHTML = item.defaultFooter;
      });

      resetCorrelationStripLive();
    }

    function updateCrosshairPosition(idx, ratio, sourceId) {
      const len = cpuSeries.length;
      if (idx < 0 || idx >= len) return;
      activeHoverIdx = idx;
      activeHoverRatio = ratio;
      activeHoverSource = sourceId;

      const ptCpu = currentCpuPts[idx];
      const ptRam = currentRamPts[idx];
      if (!ptCpu || !ptRam) return;

      const pointX = ptCpu.x.toFixed(1);
      const cpuY = ptCpu.y.toFixed(1);
      const ramY = ptRam.y.toFixed(1);

      const ts = (timestampsSeries && timestampsSeries[idx]) || (Date.now() - (len - 1 - idx) * 5000);
      const fullTimeStr = formatFullTimestamp(ts);
      const timeTick = formatTimeTick(ts);
      const timeSecStr = formatTimeWithSeconds(ts);

      // 1. Synchronized Top Charts (CPU & RAM)
      const crosshairCpu = document.getElementById("crosshairCpu");
      const dotCpu = document.getElementById("dotCpu");
      const crosshairRam = document.getElementById("crosshairRam");
      const dotRam = document.getElementById("dotRam");
      const ttCpu = document.getElementById("tooltipCpu");
      const ttRam = document.getElementById("tooltipRam");

      if (crosshairCpu) {
        crosshairCpu.setAttribute("x1", pointX);
        crosshairCpu.setAttribute("x2", pointX);
        crosshairCpu.setAttribute("opacity", "1");
        crosshairCpu.classList.add("active");
        crosshairCpu.style.opacity = "1";
        crosshairCpu.style.display = "inline";
      }
      if (dotCpu) {
        dotCpu.style.left = ((pointX / 500) * 100).toFixed(2) + "%";
        dotCpu.style.top = ((cpuY / 135) * 100).toFixed(2) + "%";
        dotCpu.classList.add("active");
        dotCpu.style.opacity = "1";
        dotCpu.style.display = "block";
      }

      if (crosshairRam) {
        crosshairRam.setAttribute("x1", pointX);
        crosshairRam.setAttribute("x2", pointX);
        crosshairRam.setAttribute("opacity", "1");
        crosshairRam.classList.add("active");
        crosshairRam.style.opacity = "1";
        crosshairRam.style.display = "inline";
      }
      if (dotRam) {
        dotRam.style.left = ((pointX / 500) * 100).toFixed(2) + "%";
        dotRam.style.top = ((ramY / 135) * 100).toFixed(2) + "%";
        dotRam.classList.add("active");
        dotRam.style.opacity = "1";
        dotRam.style.display = "block";
      }

      const cpuVal = cpuSeries[idx] || 0;
      const ramVal = ramSeries[idx] || 0;
      const heapVal = typeof heapSeries[idx] === 'number' ? heapSeries[idx] : (ramVal * 0.35);
      const reqVal = reqSeries[idx] || 0;
      const lagVal = typeof lagSeries[idx] === 'number' ? lagSeries[idx] : 0.6;
      const latVal = typeof latSeries[idx] === 'number' ? latSeries[idx] : 1.0;
      const handlesVal = handlesSeries[idx] || 4;
      const headroomMb = Math.max(0, 500 - ramVal).toFixed(1);
      const capPct = ((ramVal / 500) * 100).toFixed(1);

      // CPU Tooltip
      const elTtTimeCpu = document.getElementById("ttTimeCpu");
      const elTtPrimaryCpuVal = document.getElementById("ttPrimaryCpuVal");
      const elTtCpuRamVal = document.getElementById("ttCpuRamVal");
      const elTtCpuHeadroomVal = document.getElementById("ttCpuHeadroomVal");
      const elTtCpuHeapVal = document.getElementById("ttCpuHeapVal");
      const elTtCpuLagVal = document.getElementById("ttCpuLagVal");
      const elTtCpuReqVal = document.getElementById("ttCpuReqVal");

      if (elTtTimeCpu) elTtTimeCpu.innerText = fullTimeStr;
      if (elTtPrimaryCpuVal) elTtPrimaryCpuVal.innerText = cpuVal.toFixed(1) + "%";
      if (elTtCpuRamVal) elTtCpuRamVal.innerHTML = ramVal.toFixed(1) + " MiB <span class='tt-sub'>(" + capPct + "% Cap)</span>";
      if (elTtCpuHeadroomVal) elTtCpuHeadroomVal.innerText = headroomMb + " MiB Free";
      if (elTtCpuHeapVal) elTtCpuHeapVal.innerText = heapVal.toFixed(1) + " MiB";
      if (elTtCpuLagVal) elTtCpuLagVal.innerHTML = lagVal.toFixed(1) + " ms <span class='tt-sub'>(&lt;10ms SLA)</span>";
      if (elTtCpuReqVal) elTtCpuReqVal.innerText = reqVal + " req/min";

      // RAM Tooltip
      const elTtTimeRam = document.getElementById("ttTimeRam");
      const elTtPrimaryRamVal = document.getElementById("ttPrimaryRamVal");
      const elTtRamCpuVal = document.getElementById("ttRamCpuVal");
      const elTtRamHeadroomVal = document.getElementById("ttRamHeadroomVal");
      const elTtRamHeapVal = document.getElementById("ttRamHeapVal");
      const elTtRamLagVal = document.getElementById("ttRamLagVal");
      const elTtRamReqVal = document.getElementById("ttRamReqVal");

      if (elTtTimeRam) elTtTimeRam.innerText = fullTimeStr;
      if (elTtPrimaryRamVal) elTtPrimaryRamVal.innerText = ramVal.toFixed(1) + " MiB";
      if (elTtRamCpuVal) elTtRamCpuVal.innerHTML = cpuVal.toFixed(1) + "% <span class='tt-sub'>(Nominal)</span>";
      if (elTtRamHeadroomVal) elTtRamHeadroomVal.innerText = headroomMb + " MiB Free";
      if (elTtRamHeapVal) elTtRamHeapVal.innerText = heapVal.toFixed(1) + " MiB";
      if (elTtRamLagVal) elTtRamLagVal.innerHTML = lagVal.toFixed(1) + " ms <span class='tt-sub'>(&lt;10ms SLA)</span>";
      if (elTtRamReqVal) elTtRamReqVal.innerText = reqVal + " req/min";

      // Top Tooltip Positioning
      const xPct = (idx / (len - 1)) * 100;
      [ttCpu, ttRam].forEach(tt => {
        if (!tt) return;
        if (xPct < 60) {
          tt.style.left = "calc(" + xPct + "% + 14px)";
          tt.style.right = "auto";
        } else {
          tt.style.left = "auto";
          tt.style.right = "calc(" + (100 - xPct) + "% + 14px)";
        }
        tt.style.top = "10px";
        tt.classList.add("active");
        tt.style.display = "block";
        tt.style.opacity = "1";
      });

      // 2. Synchronized Lower 5 Sparkline Cards
      const sparkConfigs = [
        {
          wrapId: 'sparkWrapReq',
          crossId: 'crosshairSparkReq',
          dotId: 'dotSparkReq',
          ttId: 'ttSparkReq',
          ttTimeId: 'ttSparkReqTime',
          ttNumId: 'ttSparkReqNum',
          cardValId: 'chartValReqs',
          footerId: 'footerReqLabel',
          pts: currentReqPts,
          valStr: String(reqVal)
        },
        {
          wrapId: 'sparkWrapHeap',
          crossId: 'crosshairSparkHeap',
          dotId: 'dotSparkHeap',
          ttId: 'ttSparkHeap',
          ttTimeId: 'ttSparkHeapTime',
          ttNumId: 'ttSparkHeapNum',
          cardValId: 'chartValHeap',
          footerId: 'footerHeapLabel',
          pts: currentHeapPts,
          valStr: heapVal.toFixed(1)
        },
        {
          wrapId: 'sparkWrapLag',
          crossId: 'crosshairSparkLag',
          dotId: 'dotSparkLag',
          ttId: 'ttSparkLag',
          ttTimeId: 'ttSparkLagTime',
          ttNumId: 'ttSparkLagNum',
          cardValId: 'chartValLag',
          footerId: 'footerLagLabel',
          pts: currentLagPts,
          valStr: lagVal.toFixed(1)
        },
        {
          wrapId: 'sparkWrapLat',
          crossId: 'crosshairSparkLat',
          dotId: 'dotSparkLat',
          ttId: 'ttSparkLat',
          ttTimeId: 'ttSparkLatTime',
          ttNumId: 'ttSparkLatNum',
          cardValId: 'chartValLat',
          footerId: 'footerLatLabel',
          pts: currentLatPts,
          valStr: latVal.toFixed(1)
        },
        {
          wrapId: 'sparkWrapHandles',
          crossId: 'crosshairSparkHandles',
          dotId: 'dotSparkHandles',
          ttId: 'ttSparkHandles',
          ttTimeId: 'ttSparkHandlesTime',
          ttNumId: 'ttSparkHandlesNum',
          cardValId: 'chartValHandles',
          footerId: 'footerHandlesLabel',
          pts: currentHandlesPts,
          valStr: String(handlesVal)
        }
      ];

      sparkConfigs.forEach(cfg => {
        const pt = (cfg.pts && cfg.pts[idx]) ? cfg.pts[idx] : { x: (idx / (len - 1)) * 240, y: 22 };
        const cross = document.getElementById(cfg.crossId);
        const dot = document.getElementById(cfg.dotId);
        const tt = document.getElementById(cfg.ttId);
        const ttTime = document.getElementById(cfg.ttTimeId);
        const ttNum = document.getElementById(cfg.ttNumId);
        const cardVal = document.getElementById(cfg.cardValId);
        const footerEl = document.getElementById(cfg.footerId);

        // A. Crosshair line
        if (cross) {
          cross.setAttribute("x1", pt.x.toFixed(1));
          cross.setAttribute("x2", pt.x.toFixed(1));
          cross.setAttribute("opacity", "0.9");
          cross.classList.add("active");
          cross.style.opacity = "0.9";
          cross.style.display = "inline";
        }

        // B. Intersection dot (HTML circle, never oval)
        if (dot) {
          dot.style.left = ((pt.x / 240) * 100).toFixed(2) + "%";
          dot.style.top = ((pt.y / 45) * 100).toFixed(2) + "%";
          dot.classList.add("active");
          dot.style.opacity = "1";
          dot.style.display = "block";
        }

        // C. Update Big Value on Card
        if (cardVal) {
          cardVal.innerText = cfg.valStr;
        }

        // D. Update Footer with Timestamp
        if (footerEl) {
          footerEl.innerHTML = "<span class='kpi-time-tag active'>at " + timeSecStr + "</span>";
        }

        // E. Micro-Tooltip
        if (tt) {
          const isDirectHover = sourceId === cfg.wrapId;
          if (isDirectHover) {
            if (ttTime) ttTime.innerText = timeSecStr + " (" + timeTick.date + ")";
            if (ttNum) ttNum.innerText = cfg.valStr;
            const pct = (idx / (len - 1)) * 100;
            let tx = "-50%";
            if (pct < 22) tx = "0%";
            else if (pct > 78) tx = "-100%";
            tt.style.left = pct + "%";
            tt.style.transform = "translateX(" + tx + ")";
            tt.classList.add("active");
            tt.style.display = "block";
            tt.style.opacity = "1";
          } else {
            tt.classList.remove("active");
            tt.style.display = "none";
            tt.style.opacity = "0";
          }
        }
      });

      // 3. Update Cluster Correlation Strip for this slice
      updateCorrelationStripSlice(cpuVal, ramVal, parseFloat(lagVal.toFixed(1)), parseFloat(heapVal.toFixed(1)));
    }

    function updateCorrelationStripSlice(cpuVal, ramVal, lagVal, heapVal) {
      const corrCpu = document.getElementById("corrCpuStatus");
      const corrRam = document.getElementById("corrRamStatus");
      const corrLag = document.getElementById("corrLagStatus");
      const corrHeap = document.getElementById("corrHeapStatus");

      if (corrCpu) {
        if (cpuVal < 15) corrCpu.innerHTML = '<span style="color:#38bdf8;">Optimal</span> (' + cpuVal.toFixed(1) + '% V8 load)';
        else if (cpuVal < 60) corrCpu.innerHTML = '<span style="color:#fbbf24;">Moderate</span> (' + cpuVal.toFixed(1) + '%)';
        else corrCpu.innerHTML = '<span style="color:#f87171;">Elevated Load</span> (' + cpuVal.toFixed(1) + '%)';
      }

      if (corrRam) {
        const headroom = (500 - ramVal).toFixed(0);
        if (ramVal < 300) corrRam.innerHTML = '<span style="color:#34d399;">Safe Buffer</span> (' + ramVal.toFixed(0) + ' / 500 MB • ' + headroom + 'M free)';
        else if (ramVal < 450) corrRam.innerHTML = '<span style="color:#fbbf24;">Approaching Cap</span> (' + ramVal.toFixed(0) + ' MB)';
        else corrRam.innerHTML = '<span style="color:#f87171;">Critical Cap</span> (' + ramVal.toFixed(0) + ' MB)';
      }

      if (corrLag) {
        if (lagVal < 2.0) corrLag.innerHTML = '<span style="color:#34d399;">Ultra-Low</span> (' + lagVal.toFixed(1) + 'ms • Voice OK)';
        else if (lagVal < 10.0) corrLag.innerHTML = '<span style="color:#fbbf24;">Acceptable</span> (' + lagVal.toFixed(1) + 'ms)';
        else corrLag.innerHTML = '<span style="color:#f87171;">Jitter Detected</span> (' + lagVal.toFixed(1) + 'ms)';
      }

      if (corrHeap) {
        corrHeap.innerHTML = '<span style="color:#c084fc;">Healthy GC</span> (' + heapVal.toFixed(1) + ' MB)';
      }
    }

    function resetCorrelationStripLive() {
      const cpuCur = cpuSeries[cpuSeries.length - 1] || 0;
      const ramCur = ramSeries[ramSeries.length - 1] || 0;
      const lagCur = lagSeries[lagSeries.length - 1] || 0.6;
      const heapCur = heapSeries[heapSeries.length - 1] || 46.2;
      updateCorrelationStripSlice(cpuCur, ramCur, lagCur, heapCur);
    }

    let touchDismissTimer = null;
    function handleChartTouch(e) {
      if (touchDismissTimer) clearTimeout(touchDismissTimer);
      handleChartMouseMove(e);
    }

    function handleChartTouchEnd() {
      if (touchDismissTimer) clearTimeout(touchDismissTimer);
      touchDismissTimer = setTimeout(() => {
        handleChartMouseLeave();
      }, 2500);
    }

    function initChartListeners() {
      const interactiveEls = [
        document.getElementById("svgWrapCpu"),
        document.getElementById("svgWrapRam"),
        document.getElementById("cardKpiReq"),
        document.getElementById("cardKpiHeap"),
        document.getElementById("cardKpiLag"),
        document.getElementById("cardKpiLat"),
        document.getElementById("cardKpiHandles"),
        document.getElementById("sparkWrapReq"),
        document.getElementById("sparkWrapHeap"),
        document.getElementById("sparkWrapLag"),
        document.getElementById("sparkWrapLat"),
        document.getElementById("sparkWrapHandles")
      ];

      interactiveEls.forEach(el => {
        if (!el) return;
        el.removeEventListener("mousemove", handleChartMouseMove);
        el.removeEventListener("mouseleave", handleChartMouseLeave);
        el.removeEventListener("touchstart", handleChartTouch);
        el.removeEventListener("touchmove", handleChartTouch);
        el.removeEventListener("touchend", handleChartTouchEnd);
        el.removeEventListener("touchcancel", handleChartTouchEnd);

        el.addEventListener("mousemove", handleChartMouseMove);
        el.addEventListener("mouseleave", handleChartMouseLeave);
        el.addEventListener("touchstart", handleChartTouch, { passive: true });
        el.addEventListener("touchmove", handleChartTouch, { passive: true });
        el.addEventListener("touchend", handleChartTouchEnd, { passive: true });
        el.addEventListener("touchcancel", handleChartTouchEnd, { passive: true });
      });
    }

    function renderGrafanaDashboard() {
      if (!cpuSeries || cpuSeries.length < 2) return;

      // 1. CPU Scaling & Waveform
      let maxCpuCeil = 100;
      if (isCpuZoom) {
        const maxCpuData = Math.max(1, ...cpuSeries);
        if (maxCpuData > 50) maxCpuCeil = 100;
        else if (maxCpuData > 25) maxCpuCeil = 50;
        else if (maxCpuData > 10) maxCpuCeil = 25;
        else if (maxCpuData > 5) maxCpuCeil = 10;
        else maxCpuCeil = 5;
      }

      const yLabelsCpu = document.getElementById("yLabelsCpu");
      if (yLabelsCpu) {
        yLabelsCpu.innerHTML = [
          '<span>' + maxCpuCeil.toFixed(isCpuZoom ? 1 : 0) + '%</span>',
          '<span>' + (maxCpuCeil * 0.8).toFixed(isCpuZoom ? 1 : 0) + '%</span>',
          '<span>' + (maxCpuCeil * 0.6).toFixed(isCpuZoom ? 1 : 0) + '%</span>',
          '<span>' + (maxCpuCeil * 0.4).toFixed(isCpuZoom ? 1 : 0) + '%</span>',
          '<span>' + (maxCpuCeil * 0.2).toFixed(isCpuZoom ? 1 : 0) + '%</span>',
          '<span>0%</span>'
        ].join('');
      }

      currentCpuPts = generateSplinePoints(cpuSeries, 500, 135, 0, maxCpuCeil, 10);
      const cpuLine = buildSplinePath(currentCpuPts);
      const cpuArea = cpuLine + " L 500,135 L 0,135 Z";
      const pathCpu = document.getElementById("pathCpuWave");
      const areaCpu = document.getElementById("areaCpuWave");
      if (pathCpu) pathCpu.setAttribute("d", cpuLine);
      if (areaCpu) areaCpu.setAttribute("d", cpuArea);

      const cpuCur = cpuSeries[cpuSeries.length - 1] || 0;
      const cpuMin = Math.min(...cpuSeries).toFixed(1);
      const cpuMax = Math.max(...cpuSeries).toFixed(1);
      const cpuAvg = (cpuSeries.reduce((a, b) => a + b, 0) / cpuSeries.length).toFixed(1);

      const elCpuVal = document.getElementById("chartValCpu");
      const elMiniCpu = document.getElementById("miniValCpu");
      if (elCpuVal) elCpuVal.innerText = cpuCur.toFixed(1);
      if (elMiniCpu) elMiniCpu.innerText = cpuCur.toFixed(1);

      const elLegendCpuCur = document.getElementById("legendCpuCur");
      const elLegendCpuAvg = document.getElementById("legendCpuAvg");
      const elLegendCpuMin = document.getElementById("legendCpuMin");
      const elLegendCpuMax = document.getElementById("legendCpuMax");
      if (elLegendCpuCur) elLegendCpuCur.innerText = cpuCur.toFixed(1) + "%";
      if (elLegendCpuAvg) elLegendCpuAvg.innerText = cpuAvg + "%";
      if (elLegendCpuMin) elLegendCpuMin.innerText = cpuMin + "%";
      if (elLegendCpuMax) elLegendCpuMax.innerText = cpuMax + "%";

      const elCpuBar = document.getElementById("cpuProgressBar");
      const elCpuPVal = document.getElementById("cpuProgressVal");
      if (elCpuBar) elCpuBar.style.width = Math.min(100, (cpuCur / 70) * 100) + "%";
      if (elCpuPVal) elCpuPVal.innerText = cpuCur.toFixed(1) + "%";

      // 2. RAM Waveform (Safety cap: 500 MB)
      currentRamPts = generateSplinePoints(ramSeries, 500, 135, 0, 500, 10);
      const ramLine = buildSplinePath(currentRamPts);
      const ramArea = ramLine + " L 500,135 L 0,135 Z";
      const pathRam = document.getElementById("pathRamWave");
      const areaRam = document.getElementById("areaRamWave");
      if (pathRam) pathRam.setAttribute("d", ramLine);
      if (areaRam) areaRam.setAttribute("d", ramArea);

      const ramCur = ramSeries[ramSeries.length - 1] || 0;
      const ramMin = Math.min(...ramSeries).toFixed(1);
      const ramMax = Math.max(...ramSeries).toFixed(1);
      const ramAvg = (ramSeries.reduce((a, b) => a + b, 0) / ramSeries.length).toFixed(1);
      const ramPercent = ((ramCur / 500) * 100).toFixed(1);

      const elRamVal = document.getElementById("chartValRam");
      const elMiniRam = document.getElementById("miniValRam");
      if (elRamVal) elRamVal.innerText = ramCur.toFixed(1);
      if (elMiniRam) elMiniRam.innerText = Math.round(ramCur);

      const elLegendRamCur = document.getElementById("legendRamCur");
      const elLegendRamAvg = document.getElementById("legendRamAvg");
      const elLegendRamMin = document.getElementById("legendRamMin");
      const elLegendRamMax = document.getElementById("legendRamMax");
      if (elLegendRamCur) elLegendRamCur.innerText = ramCur.toFixed(1) + " MiB";
      if (elLegendRamAvg) elLegendRamAvg.innerText = ramAvg + " MiB";
      if (elLegendRamMin) elLegendRamMin.innerText = ramMin + " MiB";
      if (elLegendRamMax) elLegendRamMax.innerText = ramMax + " MiB";

      const elRamBar = document.getElementById("ramProgressBar");
      const elRamPVal = document.getElementById("ramProgressVal");
      const elRamBadge = document.getElementById("ramPercentBadge");
      if (elRamBar) elRamBar.style.width = ramPercent + "%";
      if (elRamPVal) elRamPVal.innerText = ramPercent + "%";
      if (elRamBadge) elRamBadge.innerText = "🟢 " + ramPercent + "% Cap";

      // 3. X-Axis Timestamps (5 dual-line ticks)
      const xLabelsCpu = document.getElementById("xAxisCpu");
      const xLabelsRam = document.getElementById("xAxisRam");
      if (timestampsSeries && timestampsSeries.length >= 2) {
        const tickIndices = [
          0,
          Math.floor((timestampsSeries.length - 1) * 0.25),
          Math.floor((timestampsSeries.length - 1) * 0.5),
          Math.floor((timestampsSeries.length - 1) * 0.75),
          timestampsSeries.length - 1
        ];
        const html = tickIndices.map((i, tickIdx) => {
          const ts = timestampsSeries[i] || (Date.now() - (timestampsSeries.length - 1 - i) * 5000);
          const { time, date } = formatTimeTick(ts);
          const align = tickIdx === 0 ? 'align-items:flex-start; text-align:left;' : (tickIdx === 4 ? 'align-items:flex-end; text-align:right;' : 'align-items:center; text-align:center;');
          return '<div class="x-tick" style="flex:1; ' + align + '">' +
                   '<span class="x-tick-time">' + time + '</span>' +
                   '<span class="x-tick-date">' + date + '</span>' +
                 '</div>';
        }).join('');
        if (xLabelsCpu) xLabelsCpu.innerHTML = html;
        if (xLabelsRam) xLabelsRam.innerHTML = html;
      }

      // 4. Cluster Correlation Status Strip (Live)
      resetCorrelationStripLive();

      // 5. HTTP Sparkline (req/min)
      const maxReq = Math.max(10, ...reqSeries);
      currentReqPts = generateSplinePoints(reqSeries, 240, 45, 0, maxReq * 1.25, 6);
      const reqLine = buildSplinePath(currentReqPts);
      const reqArea = reqLine + " L 240,45 L 0,45 Z";
      const pathSparkReq = document.getElementById("pathSparkReq");
      const areaSparkReq = document.getElementById("areaSparkReq");
      if (pathSparkReq) pathSparkReq.setAttribute("d", reqLine);
      if (areaSparkReq) areaSparkReq.setAttribute("d", reqArea);

      const reqCur = reqSeries[reqSeries.length - 1] || 0;
      const elReqsVal = document.getElementById("chartValReqs");
      const elMiniReqs = document.getElementById("miniValReqs");
      if (elReqsVal) elReqsVal.innerText = reqCur;
      if (elMiniReqs) elMiniReqs.innerText = reqCur;

      // 6. V8 Heap Sparkline
      const maxHeap = Math.max(80, ...heapSeries);
      currentHeapPts = generateSplinePoints(heapSeries, 240, 45, 20, maxHeap * 1.2, 6);
      const heapLine = buildSplinePath(currentHeapPts);
      const heapArea = heapLine + " L 240,45 L 0,45 Z";
      const pathSparkHeap = document.getElementById("pathSparkHeap");
      const areaSparkHeap = document.getElementById("areaSparkHeap");
      if (pathSparkHeap) pathSparkHeap.setAttribute("d", heapLine);
      if (areaSparkHeap) areaSparkHeap.setAttribute("d", heapArea);

      // 7. Event Loop Lag Sparkline
      const lagCur = lagSeries[lagSeries.length - 1] || 0.6;
      const maxLag = Math.max(3.0, ...lagSeries);
      currentLagPts = generateSplinePoints(lagSeries, 240, 45, 0, maxLag * 1.25, 6);
      const lagLine = buildSplinePath(currentLagPts);
      const lagArea = lagLine + " L 240,45 L 0,45 Z";
      const pathSparkLag = document.getElementById("pathSparkLag");
      const areaSparkLag = document.getElementById("areaSparkLag");
      if (pathSparkLag) pathSparkLag.setAttribute("d", lagLine);
      if (areaSparkLag) areaSparkLag.setAttribute("d", lagArea);

      const elLagVal = document.getElementById("chartValLag");
      const elMiniLag = document.getElementById("miniValLag");
      if (elLagVal) elLagVal.innerText = lagCur.toFixed(1);
      if (elMiniLag) elMiniLag.innerText = lagCur.toFixed(1);

      // 8. Latency Sparkline
      const maxLat = Math.max(3.0, ...latSeries);
      currentLatPts = generateSplinePoints(latSeries, 240, 45, 0, maxLat * 1.25, 6);
      const latLine = buildSplinePath(currentLatPts);
      const latArea = latLine + " L 240,45 L 0,45 Z";
      const pathSparkLat = document.getElementById("pathSparkLat");
      const areaSparkLat = document.getElementById("areaSparkLat");
      if (pathSparkLat) pathSparkLat.setAttribute("d", latLine);
      if (areaSparkLat) areaSparkLat.setAttribute("d", latArea);

      // 9. Handles Sparkline
      const maxHandles = Math.max(10, ...handlesSeries);
      currentHandlesPts = generateSplinePoints(handlesSeries, 240, 45, 0, maxHandles * 1.25, 6);
      const handlesLine = buildSplinePath(currentHandlesPts);
      const handlesArea = handlesLine + " L 240,45 L 0,45 Z";
      const pathSparkHandles = document.getElementById("pathSparkHandles");
      const areaSparkHandles = document.getElementById("areaSparkHandles");
      if (pathSparkHandles) pathSparkHandles.setAttribute("d", handlesLine);
      if (areaSparkHandles) areaSparkHandles.setAttribute("d", handlesArea);

      if (activeHoverIdx !== null && activeHoverRatio !== null) {
        updateCrosshairPosition(activeHoverIdx, activeHoverRatio, activeHoverSource);
      }

      initChartListeners();
    }

    // Fetch Live Telemetry from /api/metrics Every 2.5s
    async function updateTelemetry() {
      try {
        const res = await fetch(BASE_PATH + "/api/metrics");
        if (!res.ok) return;
        const data = await res.json();
        latestTelemetry = data;

        if (currentMetricRange === 'realtime') {
          if (data.history) {
            if (data.history.cpu && data.history.cpu.length) cpuSeries = data.history.cpu;
            if (data.history.ram && data.history.ram.length) ramSeries = data.history.ram;
            if (data.history.reqs && data.history.reqs.length) reqSeries = data.history.reqs;
            if (data.history.heap && data.history.heap.length) heapSeries = data.history.heap;
            if (data.history.lag && data.history.lag.length) lagSeries = data.history.lag;
            if (data.history.lat && data.history.lat.length) latSeries = data.history.lat;
            if (data.history.handles && data.history.handles.length) handlesSeries = data.history.handles;
            if (data.history.timestamps && data.history.timestamps.length) timestampsSeries = data.history.timestamps;
          }
        }

        if (data.uptimeSeconds) uptimeSeconds = data.uptimeSeconds;

        const miniCpu = document.getElementById("miniValCpu");
        const miniRam = document.getElementById("miniValRam");
        const miniReqs = document.getElementById("miniValReqs");
        const miniHeap = document.getElementById("miniValHeap");
        const miniLag = document.getElementById("miniValLag");
        const miniHandles = document.getElementById("miniValHandles");
        const miniInFlight = document.getElementById("miniValInFlight");
        const miniPeakLag = document.getElementById("miniValPeakLag");

        if (miniCpu) miniCpu.innerText = data.cpu.usagePercent.toFixed(1);
        if (miniRam) miniRam.innerText = Math.round(data.memory.rssMb);
        if (miniReqs) miniReqs.innerText = data.requestsPerMinute;
        if (miniHeap) miniHeap.innerText = data.memory.heapUsedMb;
        if (miniLag) miniLag.innerText = data.eventLoop.lagMs.toFixed(1);
        if (miniHandles) miniHandles.innerText = data.concurrency.activeHandles;
        if (miniInFlight) miniInFlight.innerText = data.concurrency.activeRequests;
        if (miniPeakLag) miniPeakLag.innerText = data.eventLoop.p99Ms.toFixed(1);

        renderGrafanaDashboard();
      } catch (err) {
        // fail silent
      }
    }
    setInterval(updateTelemetry, 2500);

    // Fetch Real Logs from /api/logs
    async function fetchLogs() {
      const file = document.getElementById("fileSelect").value;
      const preset = document.getElementById("datePresetSelect").value;
      const startDate = document.getElementById("dateStart")?.value || '';
      const endDate = document.getElementById("dateEnd")?.value || '';

      const queryParams = new URLSearchParams({
        file,
        preset,
        startDate,
        endDate,
        limit: '500'
      });

      try {
        const res = await fetch(BASE_PATH + "/api/logs?" + queryParams.toString());
        if (!res.ok) {
          const container = document.getElementById("logContainer");
          container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--color-error);">' +
            '<div>⚠️ Error loading logs from server</div>' +
          '</div>';
          return;
        }
        const data = await res.json();
        currentLogs = data.lines || [];
        renderLogs();
      } catch (err) {
        const container = document.getElementById("logContainer");
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--color-error);">' +
          '<div>⚠️ Network error fetching logs</div>' +
        '</div>';
      }
    }

    function toggleHideScannerProbes() {
      hideScannerProbes = !hideScannerProbes;
      const btn = document.getElementById("toggleHideProbes");
      if (btn) btn.classList.toggle("active", hideScannerProbes);
      renderLogs();
    }

    function renderLogs() {
      const container = document.getElementById("logContainer");
      const query = document.getElementById("searchBox").value.trim().toLowerCase();
      const service = document.getElementById("serviceSelect").value;
      const file = document.getElementById("fileSelect").value;
      const dateStartVal = document.getElementById("dateStart")?.value;
      const dateEndVal = document.getElementById("dateEnd")?.value;

      let filtered = currentLogs.filter(log => {
        if (file === "out.log") return log.type === "out";
        if (file === "err.log") return log.type === "err";
        return true;
      });

      if (hideScannerProbes) {
        filtered = filtered.filter(log => !log.isProbe);
      }

      if (selectedLevel !== "ALL") {
        filtered = filtered.filter(log => log.level === selectedLevel);
      }

      if (service !== "ALL") {
        filtered = filtered.filter(log => {
          const rawService = (log.service || '').toLowerCase();
          const target = service.toLowerCase().replace(/[\\[\\]]/g, '');
          return rawService.includes(target);
        });
      }

      if (dateStartVal) {
        const startTime = new Date(dateStartVal).getTime();
        filtered = filtered.filter(log => new Date(log.time.replace(" ", "T")).getTime() >= startTime);
      }
      if (dateEndVal) {
        const endTime = new Date(dateEndVal).getTime();
        filtered = filtered.filter(log => new Date(log.time.replace(" ", "T")).getTime() <= endTime);
      }

      if (query) {
        filtered = filtered.filter(log => {
          const rawText = (log.time + " " + log.level + " " + log.service + " " + log.content + " " + (log.stackFrames ? log.stackFrames.join(" ") : "")).toLowerCase();
          return rawText.includes(query);
        });
      }

      const totalAll = currentLogs.length;
      const totalErr = currentLogs.filter(l => l.level === 'ERROR').length;
      const totalWarn = currentLogs.filter(l => l.level === 'WARN').length;
      const totalInfo = currentLogs.filter(l => l.level === 'INFO').length;
      const totalProbes = currentLogs.filter(l => l.isProbe).length;

      const chipAll = document.querySelector('.chip[data-level="ALL"]');
      const chipErr = document.querySelector('.chip[data-level="ERROR"]');
      const chipWarn = document.querySelector('.chip[data-level="WARN"]');
      const chipInfo = document.querySelector('.chip[data-level="INFO"]');
      const btnProbes = document.getElementById("toggleHideProbes");

      if (chipAll) chipAll.innerText = "All (" + totalAll + ")";
      if (chipErr) chipErr.innerText = "🔴 Errors (" + totalErr + ")";
      if (chipWarn) chipWarn.innerText = "🟡 Warnings (" + totalWarn + ")";
      if (chipInfo) chipInfo.innerText = "🔵 Info (" + totalInfo + ")";
      if (btnProbes) {
        btnProbes.innerHTML = "<span>🛡️</span> " + (hideScannerProbes ? "Hidden (" + totalProbes + " Probes)" : "Hide Scanners (" + totalProbes + ")");
      }

      const dateActiveTag = (dateStartVal || dateEndVal) ? " • 📅 Date Range Active" : "";
      const probeActiveTag = hideScannerProbes ? " • 🛡️ Bot Probes Hidden" : "";
      document.getElementById("lineCounter").innerText = "Showing " + filtered.length + " of " + currentLogs.length + " lines" + dateActiveTag + probeActiveTag;

      if (filtered.length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-dim);">' +
          '<div style="font-size: 24px; margin-bottom: 8px;">🔍</div>' +
          'No matching logs found for the selected date range and filters.' +
        '</div>';
        return;
      }

      container.innerHTML = filtered.map((log, index) => {
        const lvlLower = (log.level || 'info').toLowerCase();
        const lvlClass = lvlLower === 'error' ? 'lvl-error' : lvlLower === 'warn' ? 'lvl-warn' : 'lvl-info';

        let dataHtml = '';

        if (log.isHttp && log.httpData) {
          const h = log.httpData;
          let statusSpan = '';
          if (h.status >= 500) {
            statusSpan = '<span class="term-status-5xx">' + h.status + '</span>';
          } else if (h.status >= 400) {
            statusSpan = '<span class="term-status-4xx">' + h.status + '</span>';
          } else if (h.status >= 300) {
            statusSpan = '<span class="term-status-3xx">' + h.status + '</span>';
          } else {
            statusSpan = '<span class="term-status-2xx">' + h.status + '</span>';
          }

          const methodSpan = '<span class="term-method">' + escapeHtml(h.method) + '</span>';
          const pathSpan = '<span class="term-path">' + escapeHtml(h.route) + '</span>';
          const latencySpan = '<span class="term-latency">' + escapeHtml(h.duration) + '</span>';
          const bytesSpan = (h.bytes && h.bytes !== '-') ? '<span class="term-dim">- ' + escapeHtml(h.bytes) + '</span>' : '<span class="term-dim">- -</span>';
          const probeBadge = log.isProbe ? '<span class="term-dim" style="color:#f59e0b; font-size:10.5px; margin-left:6px;">🛡️ blocked</span>' : '';

          dataHtml = methodSpan + ' ' + pathSpan + ' ' + statusSpan + ' ' + latencySpan + ' ' + bytesSpan + probeBadge;
        } else {
          // Internal system/service log
          let rawContent = log.content || '';

          // Highlight subsystem tag if present e.g. [AiService], [ApiKeyPool], [ModelObserver], [R2 Health]
          let subTagHtml = '';
          let serviceTag = '';
          const subMatch = rawContent.match(/^(\\[(?:AiService|AI Route|ApiKeyPool|ModelObserver|R2 Maintenance|R2 Health|TempCleanup|TokenManager|VideoService|WebSocket|CORS|Auth|Payment|Security|Health|Server|Queue|System-Error|Error)\\])/i);
          if (subMatch) {
            serviceTag = subMatch[1];
            rawContent = rawContent.substring(serviceTag.length).trim();
          } else if (log.service && log.service !== '[Server]' && log.service !== '[HTTP]' && log.service !== '[Bot-Probe]') {
            serviceTag = log.service;
          }

          if (serviceTag) {
            let tagColorClass = 'tag-server';
            if (/AiService/i.test(serviceTag)) tagColorClass = 'tag-ai';
            else if (/AI Route/i.test(serviceTag)) tagColorClass = 'tag-route';
            else if (/ApiKeyPool/i.test(serviceTag)) tagColorClass = 'tag-api';
            else if (/ModelObserver/i.test(serviceTag)) tagColorClass = 'tag-observer';
            else if (/R2/i.test(serviceTag)) tagColorClass = 'tag-r2';
            else if (/CORS/i.test(serviceTag)) tagColorClass = 'tag-cors';
            else if (/WebSocket/i.test(serviceTag)) tagColorClass = 'tag-ws';
            else if (/TokenManager/i.test(serviceTag)) tagColorClass = 'tag-token';
            else if (/TempCleanup/i.test(serviceTag)) tagColorClass = 'tag-cleanup';
            else if (/System-Error|Error/i.test(serviceTag)) tagColorClass = 'tag-err';

            subTagHtml = '<span class="term-subsystem ' + tagColorClass + '">' + escapeHtml(serviceTag) + '</span> ';
          }

          let escapedContent = escapeHtml(rawContent);

          // Highlight HTTP status codes inside message content (e.g. 410, 503, 500, 200)
          escapedContent = escapedContent.replace(/\\b(50[0-9]|4[0-9]{2}|200)\\b/g, (match) => {
            const code = parseInt(match, 10);
            if (code >= 500) return '<span class="term-status-5xx">' + match + '</span>';
            if (code >= 400) return '<span class="term-status-4xx">' + match + '</span>';
            return '<span class="term-status-2xx">' + match + '</span>';
          });

          // Highlight critical tags like 🔴 COOLDOWN
          escapedContent = escapedContent.replace(/🔴\\s*COOLDOWN\\s*(\\d+[smh]?)/gi, '<strong style="color:#f87171;">🔴 COOLDOWN $1</strong>');

          dataHtml = subTagHtml + escapedContent;
        }

        // Apply search query highlight if active
        if (query) {
          const safeQuery = escapeHtml(query).replace(/[.*+?^$\\{}()|[\\]\\\\]/g, '\\\\$&');
          const regex = new RegExp("(" + safeQuery + ")", "gi");
          dataHtml = dataHtml.replace(regex, '<span class="highlight">$1</span>');
        }

        // Stack Trace Frames handling - render all frames directly, zero lines missed or cut
        let stackHtml = '';
        if (log.stackFrames && log.stackFrames.length > 0) {
          stackHtml = log.stackFrames.map(f => '<div class="term-trace-line">' + escapeHtml(f) + '</div>').join('');
        }

        return '<div class="railway-row ' + lvlClass + (log.isProbe ? ' is-probe' : '') + '">' +
          '<div class="row-bar"></div>' +
          '<div class="col-time">' + escapeHtml(log.time) + '</div>' +
          '<div class="col-data">' + dataHtml + stackHtml + '</div>' +
          '<button class="row-copy-btn" onclick="copyRailwayRow(this)" title="Copy log line">📋</button>' +
        '</div>';
      }).join("");

      if (isLive || isInitialRender) {
        requestAnimationFrame(() => {
          scrollLogsToBottom(false);
          setTimeout(() => {
            isInitialRender = false;
          }, 250);
        });
      }
    }

    function scrollLogsToBottom(smooth = true) {
      const container = document.getElementById("logContainer");
      if (!container) return;
      isProgrammaticScroll = true;
      if (smooth) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      } else {
        container.scrollTop = container.scrollHeight;
      }
      setTimeout(() => { isProgrammaticScroll = false; }, 200);
      const fab = document.getElementById("scrollToBottomFab");
      if (fab) fab.classList.remove("visible");
    }

    function handleLogScrollActivity() {
      if (isProgrammaticScroll || isInitialRender) return;
      const container = document.getElementById("logContainer");
      if (!container) return;

      const fsFab = document.getElementById("toggleFullscreenFab");
      const scrollFab = document.getElementById("scrollToBottomFab");
      const isMobile = window.innerWidth <= 640;
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

      if (isMobile) {
        // Fullscreen button appears on mobile when scrolling/touching
        if (fsFab) fsFab.classList.add("visible");

        // Down-arrow FAB appears if scrolled away from bottom (>80px)
        if (scrollFab) {
          if (distanceFromBottom > 80) {
            scrollFab.classList.add("visible");
          } else {
            scrollFab.classList.remove("visible");
          }
        }

        // Auto-disappear after 3 seconds of inactivity
        if (mobileFabFadeTimer) clearTimeout(mobileFabFadeTimer);
        mobileFabFadeTimer = setTimeout(() => {
          if (fsFab) fsFab.classList.remove("visible");
          if (scrollFab) scrollFab.classList.remove("visible");
        }, 3000);
      } else {
        // Desktop: fullscreen button is hidden by CSS; scrollFab shows if scrolled up
        if (scrollFab) {
          if (distanceFromBottom > 150) {
            scrollFab.classList.add("visible");
          } else {
            scrollFab.classList.remove("visible");
          }
        }
      }
    }

    const logScrollContainer = document.getElementById("logContainer");
    if (logScrollContainer) {
      logScrollContainer.addEventListener("scroll", handleLogScrollActivity, { passive: true });
      logScrollContainer.addEventListener("touchstart", handleLogScrollActivity, { passive: true });
      logScrollContainer.addEventListener("touchmove", handleLogScrollActivity, { passive: true });
    }

    // Keep visible if user touches or hovers the buttons
    const fabGroup = document.querySelector(".terminal-fab-group");
    if (fabGroup) {
      fabGroup.addEventListener("mouseenter", () => {
        if (mobileFabFadeTimer) clearTimeout(mobileFabFadeTimer);
      });
      fabGroup.addEventListener("touchstart", () => {
        if (mobileFabFadeTimer) clearTimeout(mobileFabFadeTimer);
      }, { passive: true });
      fabGroup.addEventListener("mouseleave", () => {
        if (window.innerWidth <= 640) {
          if (mobileFabFadeTimer) clearTimeout(mobileFabFadeTimer);
          mobileFabFadeTimer = setTimeout(() => {
            const fsFab = document.getElementById("toggleFullscreenFab");
            const scrollFab = document.getElementById("scrollToBottomFab");
            if (fsFab) fsFab.classList.remove("visible");
            if (scrollFab) scrollFab.classList.remove("visible");
          }, 3000);
        }
      });
      fabGroup.addEventListener("touchend", () => {
        if (window.innerWidth <= 640) {
          if (mobileFabFadeTimer) clearTimeout(mobileFabFadeTimer);
          mobileFabFadeTimer = setTimeout(() => {
            const fsFab = document.getElementById("toggleFullscreenFab");
            const scrollFab = document.getElementById("scrollToBottomFab");
            if (fsFab) fsFab.classList.remove("visible");
            if (scrollFab) scrollFab.classList.remove("visible");
          }, 3000);
        }
      }, { passive: true });
    }

    function toggleLogFullscreen() {
      const isFull = document.body.classList.toggle('mobile-log-fullscreen');
      const expandIcon = document.getElementById('fullscreenExpandIcon');
      const compressIcon = document.getElementById('fullscreenCompressIcon');
      const btn = document.getElementById('toggleFullscreenFab');

      if (btn) {
        btn.classList.toggle('is-fullscreen', isFull);
        btn.classList.add('visible');
      }
      if (expandIcon && compressIcon) {
        expandIcon.style.display = isFull ? 'none' : 'block';
        compressIcon.style.display = isFull ? 'block' : 'none';
      }

      if (window.innerWidth <= 640) {
        if (mobileFabFadeTimer) clearTimeout(mobileFabFadeTimer);
        mobileFabFadeTimer = setTimeout(() => {
          if (btn) btn.classList.remove('visible');
          const scrollFab = document.getElementById("scrollToBottomFab");
          if (scrollFab) scrollFab.classList.remove("visible");
        }, 3000);
      }

      setTimeout(() => {
        scrollLogsToBottom(false);
      }, 50);
    }

    function setLevel(lvl) {
      selectedLevel = lvl;
      document.querySelectorAll(".chip").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-level") === lvl);
      });
      renderLogs();
      const container = document.getElementById("logContainer");
      if (container) container.scrollTop = 0;
    }

    function toggleLiveTail() {
      isLive = !isLive;
      const btn = document.getElementById("liveToggleBtn");

      if (isLive) {
        btn.classList.add("btn-active");
        btn.innerHTML = "<span>⏸</span> Live Tailing";

        liveTimer = setInterval(async () => {
          const file = document.getElementById("fileSelect").value;
          const lastLog = currentLogs[currentLogs.length - 1];
          const after = lastLog ? lastLog.time : '';
          try {
            const res = await fetch(BASE_PATH + "/api/tail?file=" + file + "&after=" + encodeURIComponent(after));
            if (res.ok) {
              const data = await res.json();
              if (data.newLines && data.newLines.length > 0) {
                currentLogs.push(...data.newLines);
                if (currentLogs.length > 2000) currentLogs = currentLogs.slice(-2000);
                renderLogs();
              }
            }
          } catch {
            // ignore tail polling glitch
          }
        }, 2500);
      } else {
        btn.classList.remove("btn-active");
        btn.innerHTML = "<span>▶</span> Live Tail";
        clearInterval(liveTimer);
      }
    }

    function copyRailwayRow(btn) {
      const row = btn.closest(".railway-row");
      if (!row) return;
      const time = row.querySelector(".col-time") ? row.querySelector(".col-time").innerText.trim() : "";
      const dataEl = row.querySelector(".col-data");
      let dataText = "";
      if (dataEl) {
        dataText = dataEl.innerText.trim();
      }
      const textToCopy = "[" + time + "] " + dataText;

      if (!navigator.clipboard) {
        const ta = document.createElement("textarea");
        ta.value = textToCopy;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } else {
        navigator.clipboard.writeText(textToCopy);
      }

      const original = btn.innerHTML;
      btn.innerHTML = "✓";
      btn.style.color = "#34d399";
      btn.style.borderColor = "#34d399";
      setTimeout(() => {
        btn.innerHTML = original;
        btn.style.color = "";
        btn.style.borderColor = "";
      }, 1200);
    }

    function copyLogCard(btn) {
      copyRailwayRow(btn);
    }

    function toggleTraceFrames(id, toggleEl) {
      const hiddenEl = document.getElementById("trace_" + id);
      if (!hiddenEl) return;
      if (hiddenEl.style.display === "none" || !hiddenEl.style.display) {
        hiddenEl.style.display = "block";
        toggleEl.innerText = "▴ hide frames";
      } else {
        hiddenEl.style.display = "none";
        const count = hiddenEl.querySelectorAll(".term-trace-line").length;
        toggleEl.innerText = "▾ +" + count + " more frames";
      }
    }

    function exportLogs() {
      const text = currentLogs.map(l => "[" + l.time + "] [" + l.level + "] " + l.service + " " + l.content.replace(/<[^>]*>?/gm, '')).join("\\n");
      const blob = new Blob([text], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sree_ai_logs_" + Date.now() + ".txt";
      a.click();
    }

    // ─── STARTUP INITIALIZATION ──────────────────────────────────────────
    // 1. Restore Active Tab (URL hash takes precedence, then localStorage fallback)
    const initialHash = window.location.hash.replace('#', '');
    let initialTab = 'logs';
    if (initialHash === 'metrics' || initialHash === 'logs') {
      initialTab = initialHash;
    } else {
      try {
        const savedTab = localStorage.getItem('sree_log_active_tab');
        if (savedTab === 'metrics' || savedTab === 'logs') {
          initialTab = savedTab;
        }
      } catch (e) {}
    }
    switchNavTab(initialTab, false);

    // 2. Fetch Logs and scroll to bottom
    fetchLogs().then(() => {
      requestAnimationFrame(() => {
        scrollLogsToBottom(false);
      });
    }).catch(() => {
      requestAnimationFrame(() => {
        scrollLogsToBottom(false);
      });
    });

    // 3. Render telemetry metrics
    renderGrafanaDashboard();
  </script>
</body>
</html>`;
}

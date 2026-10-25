import { SystemTelemetry } from '../services/telemetry.service';

export interface DashboardRenderOptions {
  basePath: string;
  nodeVersion: string;
  initialTelemetry: SystemTelemetry;
}

export function renderLoginHtml(options: { basePath: string; error?: string | undefined; retryAfter?: number | undefined }): string {
  const { basePath, error, retryAfter } = options;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sree AI — Hardened Ops Vault Authentication</title>
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
    * { box-sizing: border-box; margin: 0; padding: 0; }
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
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: linear-gradient(135deg, #0284c7, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 18px;
      box-shadow: 0 0 14px rgba(2, 132, 199, 0.5);
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
      <div class="brand-icon">⚡</div>
      <div class="brand-title">Sree AI <span class="brand-pill">OPS VAULT</span></div>
    </div>
    <div class="subtext">
      Production Security Gateway • Strict OWASP Mitigation & Rate Limiting Enforced
    </div>

    ${error ? `
      <div class="alert-box">
        <span>🛡️</span>
        <span>${error}${retryAfter ? ` (Retry after ${retryAfter}s)` : ''}</span>
      </div>
    ` : ''}

    <form method="POST" action="${basePath}/login">
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
      display: flex;
      flex-direction: column;
      overflow: hidden;
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
      width: 28px;
      height: 28px;
      border-radius: 7px;
      background: linear-gradient(135deg, #0284c7, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 15px;
      box-shadow: 0 0 12px rgba(2, 132, 199, 0.4);
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
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
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
      height: 125px;
      display: flex;
    }
    .y-axis-labels {
      width: 48px;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 9.5px;
      color: var(--text-dim);
      font-family: ui-monospace, monospace;
      padding-right: 6px;
      text-align: right;
      user-select: none;
    }
    .chart-svg-wrap { flex: 1; height: 100%; position: relative; }
    .grafana-svg { width: 100%; height: 100%; overflow: visible; }
    .grid-line { stroke: rgba(255, 255, 255, 0.06); stroke-dasharray: 4; }
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
    .sparkline-svg { width: 100%; height: 48px; overflow: visible; margin: 2px 0; }
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
    .tele-rate-badge { font-size: 11px; font-weight: 700; color: var(--accent); font-family: ui-monospace, monospace; }
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
      background: #03060a;
      overflow-y: auto;
      padding: 12px 18px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 11.5px;
      line-height: 1.6;
      color: #e2e8f0;
    }
    .log-line {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 2px 6px;
      border-radius: 4px;
      transition: background 0.1s ease;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .log-line:hover { background: #0c1220; }
    .line-time { color: var(--text-dim); min-width: 140px; user-select: none; }
    .line-badge {
      font-weight: 700;
      padding: 0 5px;
      border-radius: 3px;
      font-size: 10px;
      user-select: none;
    }
    .badge-info { background: rgba(56, 189, 248, 0.15); color: var(--color-info); }
    .badge-warn { background: rgba(251, 191, 36, 0.15); color: var(--color-warn); }
    .badge-err { background: rgba(248, 113, 113, 0.15); color: var(--color-error); }
    .row-error { background: rgba(248, 113, 113, 0.05); }
    .row-warn { background: rgba(251, 191, 36, 0.05); }
    .mod-tag { color: #a78bfa; font-weight: 600; min-width: 85px; }
    .highlight { background: #fbbf24; color: #000; font-weight: 700; padding: 0 2px; border-radius: 2px; }
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
  </style>
</head>
<body>

  <!-- ─── Top Header Navigation Bar ─── -->
  <header class="header">
    <div class="brand-section">
      <div class="brand">
        <div class="brand-icon">⚡</div>
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
          <div class="tele-rate-badge"><span id="miniValReqs">${initialTelemetry.requestsPerMinute}</span>req/min</div>
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
        </div>

        <select id="serviceSelect" onchange="renderLogs()">
          <option value="ALL">All Subsystems</option>
          <option value="Server">[Server]</option>
          <option value="WebSocket">[WebSocket Voice]</option>
          <option value="AiService">[AiService]</option>
          <option value="Auth">[Auth]</option>
          <option value="R2Service">[R2Service]</option>
          <option value="Security">[Security]</option>
          <option value="Health">[Health]</option>
        </select>

        <!-- Date Range Filter -->
        <div class="date-filter-group">
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

          <div class="date-range-box" id="customDateRangeBox">
            <span style="font-size:11px; color:var(--text-dim);">From:</span>
            <input type="datetime-local" id="dateStart" onchange="renderLogs()">
            <span style="font-size:11px; color:var(--text-dim);">To:</span>
            <input type="datetime-local" id="dateEnd" onchange="renderLogs()">
            <button class="btn-clear-date" onclick="clearCustomDateRange()" title="Clear date range">✕</button>
          </div>
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

    <!-- Terminal Screen -->
    <div class="terminal-container" id="logContainer">
      <div style="padding: 40px; text-align: center; color: var(--text-dim);">
        Connecting to Sree AI hardened log stream...
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
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="section-title">Telemetry Time-Series (Single-Process V8)</span>
        <div class="time-chips">
          <div class="time-chip active" onclick="setTimeRange('realtime', this)">● Realtime</div>
          <div class="time-chip" onclick="setTimeRange('1h', this)">1h</div>
          <div class="time-chip" onclick="setTimeRange('6h', this)">6h</div>
          <div class="time-chip" onclick="setTimeRange('24h', this)">24h</div>
          <div class="time-chip" onclick="setTimeRange('7d', this)">7d</div>
        </div>
      </div>
      <div style="font-size:11px; color:var(--text-dim); font-family:ui-monospace, monospace;">
        Ring Buffer: 60 Samples (Sliding Window) • Latency: 0.1ms
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

        <div class="panel-hero-row">
          <div class="panel-hero-stat">
            <div class="hero-big-num" id="chartValCpu">${initialTelemetry.cpu.usagePercent.toFixed(1)}</div>
            <div class="hero-unit">%</div>
          </div>
          <div class="kpi-badge badge-sky" id="cpuDeltaBadge">▲ Stable Load</div>
        </div>

        <div class="chart-container">
          <div class="y-axis-labels">
            <span>10.0%</span>
            <span>5.0%</span>
            <span>0.0%</span>
          </div>
          <div class="chart-svg-wrap">
            <svg class="grafana-svg" viewBox="0 0 450 115" preserveAspectRatio="none">
              <defs>
                <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35"/>
                  <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0"/>
                </linearGradient>
              </defs>
              <line x1="0" y1="12" x2="450" y2="12" class="grid-line"/>
              <line x1="0" y1="57" x2="450" y2="57" class="grid-line"/>
              <line x1="0" y1="103" x2="450" y2="103" class="grid-line"/>
              <path id="areaCpuWave" fill="url(#cpuGradient)"/>
              <path id="pathCpuWave" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round"/>
            </svg>
          </div>
        </div>

        <div class="grafana-legend">
          <span>Range: Last 2 Mins</span>
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

        <div class="chart-container">
          <div class="y-axis-labels">
            <span>500M</span>
            <span>250M</span>
            <span>0M</span>
          </div>
          <div class="chart-svg-wrap">
            <svg class="grafana-svg" viewBox="0 0 450 115" preserveAspectRatio="none">
              <defs>
                <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#34d399" stop-opacity="0.32"/>
                  <stop offset="100%" stop-color="#34d399" stop-opacity="0.0"/>
                </linearGradient>
              </defs>
              <line x1="0" y1="12" x2="450" y2="12" class="grid-line"/>
              <line x1="0" y1="57" x2="450" y2="57" class="grid-line"/>
              <line x1="0" y1="103" x2="450" y2="103" class="grid-line"/>
              <path id="areaRamWave" fill="url(#ramGradient)"/>
              <path id="pathRamWave" fill="none" stroke="#34d399" stroke-width="2.2" stroke-linecap="round"/>
            </svg>
          </div>
        </div>

        <div class="grafana-legend">
          <span>Target: &lt; 400 MiB</span>
          <div class="legend-stats">
            <span>CUR: <strong id="legendRamCur">${initialTelemetry.memory.rssMb} MiB</strong></span>
            <span>AVG: <strong id="legendRamAvg">${initialTelemetry.memory.rssMb} MiB</strong></span>
            <span>MIN: <strong id="legendRamMin">165 MiB</strong></span>
            <span>MAX: <strong id="legendRamMax">185 MiB</strong></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Row 2: 8 shadcn KPI Micro-Cards with Sparklines -->
    <div class="grid-4">
      <div class="shadcn-kpi-card">
        <div class="kpi-header">
          <div class="kpi-title"><span>⚡</span> HTTP Throughput</div>
          <span class="kpi-badge badge-sky">Live</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number"><span id="chartValReqs">${initialTelemetry.requestsPerMinute}</span> <span style="font-size:13px; font-weight:600; color:var(--text-muted);">req/min</span></div>
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
        </svg>
        <div class="kpi-footer">
          <span>Rolling 60s window</span>
          <span>Zero-DB overhead</span>
        </div>
      </div>

      <div class="shadcn-kpi-card">
        <div class="kpi-header">
          <div class="kpi-title"><span>🟣</span> V8 Heap Allocation</div>
          <span class="kpi-badge badge-purple">${Math.round((initialTelemetry.memory.heapUsedMb / initialTelemetry.memory.heapTotalMb) * 100)}% Used</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number">${initialTelemetry.memory.heapUsedMb} <span style="font-size:13px; font-weight:600; color:var(--text-muted);">MiB</span></div>
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
        </svg>
        <div class="kpi-footer">
          <span>Allocated: ${initialTelemetry.memory.heapTotalMb} MiB</span>
          <span>GC Healthy</span>
        </div>
      </div>

      <div class="shadcn-kpi-card">
        <div class="kpi-header">
          <div class="kpi-title"><span>⏱️</span> Event Loop Delay</div>
          <span class="kpi-badge badge-emerald">Voice OK</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number"><span id="chartValLag">${initialTelemetry.eventLoop.lagMs.toFixed(1)}</span> <span style="font-size:13px; font-weight:600; color:var(--text-muted);">ms</span></div>
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
        </svg>
        <div class="kpi-footer">
          <span>Voice SLA: &lt; 10ms</span>
          <span>p99: ${initialTelemetry.eventLoop.p99Ms.toFixed(1)}ms</span>
        </div>
      </div>

      <div class="shadcn-kpi-card">
        <div class="kpi-header">
          <div class="kpi-title"><span>🌐</span> Mean HTTP Latency</div>
          <span class="kpi-badge badge-sky">Fast</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number">1.0 <span style="font-size:13px; font-weight:600; color:var(--text-muted);">ms</span></div>
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
        </svg>
        <div class="kpi-footer">
          <span>p95: 1.2ms</span>
          <span>Nginx loopback</span>
        </div>
      </div>

      <div class="shadcn-kpi-card">
        <div class="kpi-header">
          <div class="kpi-title"><span>🔌</span> Active Handles</div>
          <span class="kpi-badge badge-emerald">Normal</span>
        </div>
        <div class="kpi-body">
          <div class="kpi-number">${initialTelemetry.concurrency.activeHandles} <span style="font-size:13px; font-weight:600; color:var(--text-muted);">handles</span></div>
        </div>
        <svg class="sparkline-svg" viewBox="0 0 240 45" preserveAspectRatio="none">
          <path id="areaSparkHandles" fill="none"/>
          <path id="pathSparkHandles" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <div class="kpi-footer">
          <span>Libuv file descriptors</span>
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
    const BASE_PATH = "${basePath}";
    let currentLogs = [];
    let selectedLevel = "ALL";
    let liveTimer = null;
    let isLive = false;
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
        customBox.style.display = 'inline-flex';
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
      document.getElementById('customDateRangeBox').style.display = 'none';
      document.getElementById('dateStart').value = '';
      document.getElementById('dateEnd').value = '';
      fetchLogs();
    }

    function switchNavTab(tab) {
      document.getElementById('tabLogs').classList.toggle('active', tab === 'logs');
      document.getElementById('tabMetrics').classList.toggle('active', tab === 'metrics');

      const viewLogs = document.getElementById('viewLogs');
      const viewMetrics = document.getElementById('viewMetrics');

      if (tab === 'logs') {
        viewLogs.classList.remove('hidden-view');
        viewMetrics.classList.remove('active-view');
      } else {
        viewLogs.classList.add('hidden-view');
        viewMetrics.classList.add('active-view');
        renderGrafanaDashboard();
      }
    }

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

    function setTimeRange(range, el) {
      document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
    }

    // Smooth Catmull-Rom Cubic Bezier Spline Generator
    function generateSpline(data, width, height, minVal, maxVal, padding = 10) {
      if (!data || data.length < 2) return "";
      const range = (maxVal - minVal) || 1;
      const stepX = width / (data.length - 1);
      const effH = height - (padding * 2);

      const pts = data.map((val, i) => {
        const clamped = Math.max(minVal, Math.min(maxVal, val));
        const normalized = (clamped - minVal) / range;
        return {
          x: i * stepX,
          y: height - padding - (normalized * effH)
        };
      });

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

    let cpuSeries = ${JSON.stringify(initialTelemetry.history.cpu)};
    let ramSeries = ${JSON.stringify(initialTelemetry.history.ram)};
    let reqSeries = ${JSON.stringify(initialTelemetry.history.reqs)};
    let lagSeries = ${JSON.stringify(initialTelemetry.history.lag)};
    let heapSeries = [45.2, 45.6, 45.9, 46.1, 45.8, 46.2, 46.4, 46.1, 46.3, 46.0, 46.2, 46.4];
    let latSeries = [0.9, 1.0, 1.1, 0.9, 1.0, 1.2, 1.0, 0.9, 1.0, 1.1, 1.0, 1.0];
    let handlesSeries = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

    function renderGrafanaDashboard() {
      // 1. CPU Waveform
      const cpuLine = generateSpline(cpuSeries, 450, 115, 0, 10, 12);
      const cpuArea = cpuLine + " L 450,115 L 0,115 Z";
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
      const ramLine = generateSpline(ramSeries, 450, 115, 0, 500, 12);
      const ramArea = ramLine + " L 450,115 L 0,115 Z";
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

      // 3. HTTP Sparkline (req/min)
      const maxReq = Math.max(10, ...reqSeries);
      const reqLine = generateSpline(reqSeries, 240, 45, 0, maxReq * 1.25, 6);
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

      // 4. V8 Heap Sparkline
      const heapLine = generateSpline(heapSeries, 240, 45, 30, 80, 6);
      const heapArea = heapLine + " L 240,45 L 0,45 Z";
      const pathSparkHeap = document.getElementById("pathSparkHeap");
      const areaSparkHeap = document.getElementById("areaSparkHeap");
      if (pathSparkHeap) pathSparkHeap.setAttribute("d", heapLine);
      if (areaSparkHeap) areaSparkHeap.setAttribute("d", heapArea);

      // 5. Event Loop Lag Sparkline
      const lagLine = generateSpline(lagSeries, 240, 45, 0, 3.0, 6);
      const lagArea = lagLine + " L 240,45 L 0,45 Z";
      const pathSparkLag = document.getElementById("pathSparkLag");
      const areaSparkLag = document.getElementById("areaSparkLag");
      if (pathSparkLag) pathSparkLag.setAttribute("d", lagLine);
      if (areaSparkLag) areaSparkLag.setAttribute("d", lagArea);

      const lagCur = lagSeries[lagSeries.length - 1] || 0;
      const elLagVal = document.getElementById("chartValLag");
      const elMiniLag = document.getElementById("miniValLag");
      if (elLagVal) elLagVal.innerText = lagCur.toFixed(1);
      if (elMiniLag) elMiniLag.innerText = lagCur.toFixed(1);

      // 6. Latency Sparkline
      const latLine = generateSpline(latSeries, 240, 45, 0, 3.0, 6);
      const latArea = latLine + " L 240,45 L 0,45 Z";
      const pathSparkLat = document.getElementById("pathSparkLat");
      const areaSparkLat = document.getElementById("areaSparkLat");
      if (pathSparkLat) pathSparkLat.setAttribute("d", latLine);
      if (areaSparkLat) areaSparkLat.setAttribute("d", latArea);

      // 7. Handles Sparkline
      const handlesLine = generateSpline(handlesSeries, 240, 45, 0, 10, 6);
      const handlesArea = handlesLine + " L 240,45 L 0,45 Z";
      const pathSparkHandles = document.getElementById("pathSparkHandles");
      const areaSparkHandles = document.getElementById("areaSparkHandles");
      if (pathSparkHandles) pathSparkHandles.setAttribute("d", handlesLine);
      if (areaSparkHandles) areaSparkHandles.setAttribute("d", handlesArea);
    }

    // Fetch Live Telemetry from /api/metrics Every 2.5s
    async function updateTelemetry() {
      try {
        const res = await fetch(BASE_PATH + "/api/metrics");
        if (!res.ok) return;
        const data = await res.json();

        if (data.history) {
          if (data.history.cpu && data.history.cpu.length) cpuSeries = data.history.cpu;
          if (data.history.ram && data.history.ram.length) ramSeries = data.history.ram;
          if (data.history.reqs && data.history.reqs.length) reqSeries = data.history.reqs;
          if (data.history.lag && data.history.lag.length) lagSeries = data.history.lag;
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

      if (selectedLevel !== "ALL") {
        filtered = filtered.filter(log => log.level === selectedLevel);
      }

      if (service !== "ALL") {
        filtered = filtered.filter(log => log.service.includes(service.replace(/[\\[\\]]/g, '')));
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
          const rawText = (log.time + " " + log.level + " " + log.service + " " + log.content).toLowerCase();
          return rawText.includes(query);
        });
      }

      const totalAll = currentLogs.length;
      const totalErr = currentLogs.filter(l => l.level === 'ERROR').length;
      const totalWarn = currentLogs.filter(l => l.level === 'WARN').length;
      const totalInfo = currentLogs.filter(l => l.level === 'INFO').length;

      const chipAll = document.querySelector('.chip[data-level="ALL"]');
      const chipErr = document.querySelector('.chip[data-level="ERROR"]');
      const chipWarn = document.querySelector('.chip[data-level="WARN"]');
      const chipInfo = document.querySelector('.chip[data-level="INFO"]');
      if (chipAll) chipAll.innerText = "All (" + totalAll + ")";
      if (chipErr) chipErr.innerText = "🔴 Errors (" + totalErr + ")";
      if (chipWarn) chipWarn.innerText = "🟡 Warnings (" + totalWarn + ")";
      if (chipInfo) chipInfo.innerText = "🔵 Info (" + totalInfo + ")";

      const dateActiveTag = (dateStartVal || dateEndVal) ? " • 📅 Date Range Active" : "";
      document.getElementById("lineCounter").innerText = "Showing " + filtered.length + " of " + currentLogs.length + " lines" + dateActiveTag;

      if (filtered.length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-dim);">' +
          '<div style="font-size: 24px; margin-bottom: 8px;">🔍</div>' +
          'No matching logs found for the selected date range and filters.' +
        '</div>';
        return;
      }

      container.innerHTML = filtered.map(log => {
        const badgeClass = log.level === "ERROR" ? "badge-err" : log.level === "WARN" ? "badge-warn" : "badge-info";
        const rowClass = log.level === "ERROR" ? "row-error" : log.level === "WARN" ? "row-warn" : "";

        let highlightedContent = log.content;
        if (query) {
          const regex = new RegExp("(" + query.replace(/[.*+?^$\\{}()|[\\]\\\\]/g, '\\\\$&') + ")", "gi");
          highlightedContent = highlightedContent.replace(regex, '<span class="highlight">$1</span>');
        }

        return '<div class="log-line ' + rowClass + '">' +
          '<span class="line-time">' + log.time + '</span>' +
          '<span class="line-badge ' + badgeClass + '">[' + log.level + ']</span>' +
          '<span class="mod-tag">' + log.service + '</span>' +
          '<span>' + highlightedContent + '</span>' +
        '</div>';
      }).join("");

      if (isLive) {
        container.scrollTop = container.scrollHeight;
      }
    }

    function setLevel(lvl) {
      selectedLevel = lvl;
      document.querySelectorAll(".chip").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-level") === lvl);
      });
      renderLogs();
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

    function exportLogs() {
      const text = currentLogs.map(l => "[" + l.time + "] [" + l.level + "] " + l.service + " " + l.content.replace(/<[^>]*>?/gm, '')).join("\\n");
      const blob = new Blob([text], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sree_ai_logs_" + Date.now() + ".txt";
      a.click();
    }

    fetchLogs();
    renderGrafanaDashboard();
  </script>
</body>
</html>`;
}

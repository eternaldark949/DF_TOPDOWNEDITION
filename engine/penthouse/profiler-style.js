/** Penthouse / profiler presentation: component-scoped styles; removed with the viewer root. */
export const PROFILER_STYLE=`
.etrnl-profiler{position:absolute;right:30px;top:92px;width:min(390px,calc(100vw - 40px));max-height:calc(100dvh - 190px);overflow:auto;background:#11131eef;border:1px solid #c6ae774d;border-radius:7px;color:#d5cfdf;font:11px/1.55 system-ui,sans-serif;z-index:2;box-shadow:0 12px 50px #0004}
.etrnl-profiler>summary{position:sticky;top:0;background:#191a28;z-index:1;-webkit-tap-highlight-color:transparent}
.etrnl-profiler summary{padding:12px 16px;cursor:pointer;color:#d5bb85;text-transform:uppercase;letter-spacing:.14em;font-size:10px}
.etrnl-profiler .profile-body{padding:0 16px 15px}.etrnl-profiler .profile-controls{display:flex;flex-wrap:wrap;gap:7px 12px;margin:8px 0}
.etrnl-profiler label{display:flex;align-items:center;gap:4px}.etrnl-profiler input{accent-color:#cfb274}
.etrnl-profiler button{font:inherit;padding:5px 8px;border:1px solid #a7957255;background:#242335;color:inherit;border-radius:4px;cursor:pointer}
.etrnl-profiler button:disabled{opacity:.4;cursor:default}.etrnl-profiler .profile-actions{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
.etrnl-profiler .profile-state{color:#b7a9d5}.etrnl-profiler .profile-hint{color:#9690aa;font-size:10px;margin:7px 0}
.etrnl-profiler svg{display:block;width:100%;height:88px;background:#0a0d17;border-radius:4px;margin:8px 0}
.etrnl-profiler .profile-grid{width:100%;border-collapse:collapse;font-size:10px;font-variant-numeric:tabular-nums}
.etrnl-profiler th{text-align:right;color:#a99cb5;font-weight:400}.etrnl-profiler th:first-child,.etrnl-profiler td:first-child{text-align:left}
.etrnl-profiler td{text-align:right;border-top:1px solid #91809c22;padding:3px 0}.etrnl-profiler td:first-child{max-width:185px;overflow:hidden;text-overflow:ellipsis}
.etrnl-profiler h3{font:10px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.12em;color:#c2ab80;margin:12px 0 5px}
.etrnl-profiler pre{max-height:160px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#0b0e17;padding:8px;font-size:9px}
.etrnl-profiler .profile-error{color:#f1b59a}.etrnl-profiler .profile-legend{font-size:9px;color:#b1a4c1}
@media(max-width:650px){.etrnl-profiler{right:20px;top:145px;width:calc(100vw - 40px);max-height:calc(100dvh - 185px)}.etrnl-profiler:not([open]){width:auto}.etrnl-profiler>summary{position:sticky;top:0;background:#191a28;z-index:1;-webkit-tap-highlight-color:transparent}
.etrnl-profiler summary{padding:9px 12px}.etrnl-profiler .profile-body{padding:0 12px 12px}}
`;

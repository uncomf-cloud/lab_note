/**
 * lab_note Frontend Logic
 * Includes:
 * - Resizable sidebar with persistent width & stable vertical scrollbar
 * - Right-click context menus for Projects, Experiments, and Protocols
 * - Project hiding & restoring
 * - In-place duplication with prefilled form for both Experiments and Protocols
 * - Protocol ID auto-generation (no manual ID required)
 * - Clean A4/PDF export
 */

const SVG_EXPAND = '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
const SVG_COMPRESS = '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>';

// Toast Notification
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️"
  };
  const icon = iconMap[type] || "ℹ️";

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 250);
  }, 3200);
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    return dateStr.split(" ")[0];
  } catch (e) {
    return dateStr;
  }
}

let allProjects = [];
let allExperiments = [];
let allProtocols = [];
let currentSelectedProjectId = null;
let selectedTag = null;
let expandedProjects = new Set();

// Protocol selection states (Left-click multi-select & editor multi-select)
let selectedProtocolIds = new Set();
let editorSelectedProtocolIds = new Set();

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Hidden projects stored in localStorage
let hiddenProjects = new Set(JSON.parse(localStorage.getItem("lab_note_hidden_projects") || "[]"));

// Active state in editor
let currentEditingProjectId = null;
let currentEditingExpId = null;

// Fullscreen states
let isFullscreenInput = false;
let isFullscreenPreview = false;

document.addEventListener("DOMContentLoaded", () => {
  initApp();
  initResizer();
  initContextMenu();
});

async function initApp() {
  await refreshProjectsAndTree();
  await loadProtocols();

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      filterAndRenderExperiments(e.target.value);
    });
  }

  const markdownInput = document.getElementById("markdown-input");
  if (markdownInput) {
    markdownInput.addEventListener("input", updatePreview);
    initEditorDragAndPaste(markdownInput);
  }

  const inputTitle = document.getElementById("input-title");
  if (inputTitle) inputTitle.addEventListener("input", updateCollapsedMetaSummary);
  const inputProject = document.getElementById("input-project");
  if (inputProject) inputProject.addEventListener("change", updateCollapsedMetaSummary);
  const inputStatus = document.getElementById("input-status");
  if (inputStatus) inputStatus.addEventListener("change", updateCollapsedMetaSummary);
}

// ==========================================
// Vertical Pane Resizer
// ==========================================

function initResizer() {
  const resizer = document.getElementById("pane-resizer");
  const sidebar = document.getElementById("app-sidebar");
  if (!resizer || !sidebar) return;

  const savedWidth = localStorage.getItem("lab_note_sidebar_w");
  if (savedWidth) {
    sidebar.style.width = `${savedWidth}px`;
  }

  let isResizing = false;

  resizer.addEventListener("mousedown", (e) => {
    isResizing = true;
    resizer.classList.add("resizing");
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const newWidth = Math.min(Math.max(e.clientX, 200), 600);
    sidebar.style.width = `${newWidth}px`;
  });

  window.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove("resizing");
      document.body.style.cursor = "default";
      const finalWidth = parseInt(sidebar.style.width);
      if (finalWidth) {
        localStorage.setItem("lab_note_sidebar_w", finalWidth);
      }
    }
  });
}

// ==========================================
// Custom Right-Click Context Menu
// ==========================================

function initContextMenu() {
  const menu = document.getElementById("context-menu");

  document.addEventListener("click", () => {
    if (menu) menu.style.display = "none";
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu) {
      menu.style.display = "none";
    }
  });
}

function showContextMenu(x, y, items) {
  const menu = document.getElementById("context-menu");
  if (!menu) return;

  menu.innerHTML = ""; // Clear existing

  items.forEach(item => {
    if (item.divider) {
      const divider = document.createElement("div");
      divider.className = "context-menu-divider";
      menu.appendChild(divider);
      return;
    }

    const menuItem = document.createElement("div");
    menuItem.className = "context-menu-item";
    
    if (item.icon) {
      const iconSpan = document.createElement("span");
      iconSpan.textContent = item.icon;
      menuItem.appendChild(iconSpan);
    }

    const labelSpan = document.createElement("span");
    labelSpan.textContent = item.label;
    menuItem.appendChild(labelSpan);

    menuItem.addEventListener("click", (e) => {
      e.stopPropagation();
      hideContextMenu();
      if (typeof item.action === "function") {
        item.action();
      }
    });

    menu.appendChild(menuItem);
  });

  menu.style.display = "block";

  // Prevent overflowing window boundaries
  const menuRect = menu.getBoundingClientRect();
  const posX = (x + menuRect.width > window.innerWidth) ? x - menuRect.width : x;
  const posY = (y + menuRect.height > window.innerHeight) ? y - menuRect.height : y;

  menu.style.left = `${Math.max(posX, 10)}px`;
  menu.style.top = `${Math.max(posY, 10)}px`;
}

function hideContextMenu() {
  const menu = document.getElementById("context-menu");
  if (menu) menu.style.display = "none";
}

// ==========================================
// SPA View Router
// ==========================================

function showView(viewName) {
  const expView = document.getElementById("view-experiments");
  const editView = document.getElementById("view-editor");
  const protoView = document.getElementById("view-protocols");

  const searchBox = document.getElementById("global-search-box");
  const editorNavBack = document.getElementById("editor-nav-back");
  const actionsDashboard = document.getElementById("actions-dashboard");
  const actionsEditor = document.getElementById("actions-editor");

  resetFullscreen();

  if (viewName === "editor") {
    if (expView) expView.style.display = "none";
    if (protoView) protoView.style.display = "none";
    if (editView) editView.style.display = "flex";

    if (searchBox) searchBox.style.display = "none";
    if (editorNavBack) editorNavBack.style.display = "flex";
    if (actionsDashboard) actionsDashboard.style.display = "none";
    if (actionsEditor) actionsEditor.style.display = "flex";
  } else if (viewName === "protocols") {
    if (expView) expView.style.display = "none";
    if (editView) editView.style.display = "none";
    if (protoView) protoView.style.display = "block";

    if (searchBox) searchBox.style.display = "flex";
    if (editorNavBack) editorNavBack.style.display = "none";
    if (actionsDashboard) actionsDashboard.style.display = "flex";
    if (actionsEditor) actionsEditor.style.display = "none";

    document.querySelectorAll(".menu-item").forEach((el) => el.classList.remove("active"));
    const protoMenu = document.getElementById("menu-protocols");
    if (protoMenu) protoMenu.classList.add("active");
  } else {
    if (expView) expView.style.display = "block";
    if (editView) editView.style.display = "none";
    if (protoView) protoView.style.display = "none";

    if (searchBox) searchBox.style.display = "flex";
    if (editorNavBack) editorNavBack.style.display = "none";
    if (actionsDashboard) actionsDashboard.style.display = "flex";
    if (actionsEditor) actionsEditor.style.display = "none";

    document.querySelectorAll(".menu-item").forEach((el) => el.classList.remove("active"));
    const expMenu = document.getElementById("menu-experiments");
    if (expMenu) expMenu.classList.add("active");
  }
}

function backToExperimentList() {
  showView("experiments");
  filterAndRenderExperiments();
}

function switchTab(tabName) {
  showView(tabName);
}

// ==========================================
// Project Tree & Dashboard Logic
// ==========================================

async function refreshProjectsAndTree() {
  try {
    const res = await fetch("/api/projects");
    allProjects = await res.json();

    const expRes = await fetch("/api/experiments");
    allExperiments = await expRes.json();

    const visibleCount = allProjects.filter(p => !hiddenProjects.has(p.id)).length;
    const badgeEl = document.getElementById("project-count-badge");
    if (badgeEl) badgeEl.textContent = visibleCount;

    renderProjectsTree();
    renderTagFilters();
    filterAndRenderExperiments();
  } catch (e) {
    console.error("Error refreshing projects", e);
  }
}

let subgroupExpandedState = {};

function isSubgroupExpanded(projectId, statusGroup) {
  const key = `${projectId}_${statusGroup}`;
  if (subgroupExpandedState[key] !== undefined) {
    return subgroupExpandedState[key];
  }
  return statusGroup === "in_progress"; // 進行中はデフォルト展開、完了はデフォルト折り畳み
}

function toggleSubgroup(projectId, statusGroup) {
  const key = `${projectId}_${statusGroup}`;
  subgroupExpandedState[key] = !isSubgroupExpanded(projectId, statusGroup);
  renderProjectsTree();
}

function renderProjectsTree() {
  const container = document.getElementById("project-tree-list");
  if (!container) return;

  const visibleProjects = allProjects.filter(p => !hiddenProjects.has(p.id));

  if (visibleProjects.length === 0) {
    container.innerHTML = `
      <div style="padding: 12px; font-size: 0.8rem; color: #64748b; text-align: center;">
        表示中のプロジェクトがありません<br>
        <button class="btn btn-secondary" onclick="openHiddenProjectsModal()" style="margin-top: 8px; font-size: 0.75rem; padding: 2px 8px;">
          非表示プロジェクトを管理
        </button>
      </div>`;
    return;
  }

  container.innerHTML = visibleProjects.map((p) => {
    const isExpanded = expandedProjects.has(p.id);
    const isSelected = currentSelectedProjectId === p.id;
    const expCount = p.experiments ? p.experiments.length : 0;
    
    let expItemsHtml = "";
    if (isExpanded && p.experiments && p.experiments.length > 0) {
      // 実施日昇順（早い順） -> ノート名昇順
      const sortedExps = [...p.experiments].sort((a, b) => {
        const dateA = a.date || "9999-99-99";
        const dateB = b.date || "9999-99-99";
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (a.title || a.id || "").localeCompare(b.title || b.id || "");
      });

      const inProgressList = sortedExps.filter(e => e.status !== "completed");
      const completedList = sortedExps.filter(e => e.status === "completed");

      const isProgExpanded = isSubgroupExpanded(p.id, "in_progress");
      const isCompExpanded = isSubgroupExpanded(p.id, "completed");

      const renderItem = (e) => {
        const icon = e.status === "completed" ? "✅" : "📝";
        const isEditingThis = currentEditingProjectId === p.id && currentEditingExpId === e.id;
        const dateStr = e.date ? `[${e.date}] ` : "";
        return `
          <div class="experiment-tree-item ${isEditingThis ? 'active' : ''}" 
               onclick="event.stopPropagation(); openEditorForExperiment('${p.id}', '${e.id}')"
               oncontextmenu="handleExperimentContextMenu(event, '${p.id}', '${e.id}')">
            <span>${icon}</span>
            <span style="overflow: hidden; text-overflow: ellipsis;" title="${e.date ? e.date + ' ' : ''}${e.title}">${dateStr}${e.title}</span>
          </div>
        `;
      };

      expItemsHtml = `
        <div class="tree-subgroup">
          <div class="tree-subgroup-header" onclick="event.stopPropagation(); toggleSubgroup('${p.id}', 'in_progress')" title="クリックして開閉">
            <div class="tree-subgroup-title">
              <span class="tree-subgroup-toggle ${isProgExpanded ? 'expanded' : ''}">▶</span>
              <span>⏳ 進行中</span>
            </div>
            <span class="sidebar-badge-mini">${inProgressList.length}</span>
          </div>
          ${isProgExpanded ? `
            <div class="tree-subgroup-items">
              ${inProgressList.length > 0 ? inProgressList.map(renderItem).join("") : '<div class="tree-empty-hint">(なし)</div>'}
            </div>
          ` : ''}
        </div>
        <div class="tree-subgroup" style="margin-top: 4px;">
          <div class="tree-subgroup-header" onclick="event.stopPropagation(); toggleSubgroup('${p.id}', 'completed')" title="クリックして開閉">
            <div class="tree-subgroup-title">
              <span class="tree-subgroup-toggle ${isCompExpanded ? 'expanded' : ''}">▶</span>
              <span>✅ 完了</span>
            </div>
            <span class="sidebar-badge-mini">${completedList.length}</span>
          </div>
          ${isCompExpanded ? `
            <div class="tree-subgroup-items">
              ${completedList.length > 0 ? completedList.map(renderItem).join("") : '<div class="tree-empty-hint">(なし)</div>'}
            </div>
          ` : ''}
        </div>
      `;
    } else if (isExpanded && expCount === 0) {
      expItemsHtml = '<div style="padding: 4px 8px; font-size: 0.75rem; color: #64748b;">ノートなし</div>';
    }

    return `
      <div class="project-node">
        <div class="project-node-header ${isSelected ? 'active' : ''}" 
             onclick="selectProject('${p.id}')"
             oncontextmenu="handleProjectContextMenu(event, '${p.id}')">
          <div class="project-node-left">
            <span class="project-toggle-icon ${isExpanded ? 'expanded' : ''}" onclick="event.stopPropagation(); toggleProjectExpand('${p.id}')">▶</span>
            <span>📁</span>
            <span style="overflow: hidden; text-overflow: ellipsis;" title="${p.id}">${p.id}</span>
          </div>
          <div class="project-actions">
            <span class="sidebar-badge">${expCount}</span>
            <button class="btn-icon-mini" title="新規ノート作成" onclick="event.stopPropagation(); openEditorForNew('${p.id}')">➕</button>
          </div>
        </div>
        ${isExpanded ? `<div class="project-experiments-list">${expItemsHtml}</div>` : ''}
      </div>
    `;
  }).join("");
}

// Right-click on project
function handleProjectContextMenu(event, projectId) {
  event.preventDefault();
  event.stopPropagation();

  const items = [
    {
      icon: "➕",
      label: "新規ノート作成",
      action: () => openEditorForNew(projectId)
    },
    {
      icon: "👁️‍🗨️",
      label: "プロジェクトの非表示",
      action: () => hideProject(projectId)
    },
    { divider: true },
    {
      icon: "⚙️",
      label: "非表示プロジェクトの表示",
      action: () => openHiddenProjectsModal()
    }
  ];

  showContextMenu(event.clientX, event.clientY, items);
}

// Right-click on experiment
function handleExperimentContextMenu(event, projectId, expId) {
  event.preventDefault();
  event.stopPropagation();

  const items = [
    {
      icon: "📄",
      label: "PDF出力",
      action: () => exportNoteToPdf(projectId, expId)
    },
    {
      icon: "📋",
      label: "複製 (登録画面で編集)",
      action: () => duplicateExperimentToEditor(projectId, expId)
    },
    { divider: true },
    {
      icon: "🗑️",
      label: "削除",
      action: () => deleteExperimentDirect(projectId, expId)
    }
  ];

  showContextMenu(event.clientX, event.clientY, items);
}

// Project hiding & restoring
function hideProject(projectId) {
  hiddenProjects.add(projectId);
  localStorage.setItem("lab_note_hidden_projects", JSON.stringify(Array.from(hiddenProjects)));
  if (currentSelectedProjectId === projectId) {
    currentSelectedProjectId = null;
  }
  refreshProjectsAndTree();
}

function restoreProject(projectId) {
  hiddenProjects.delete(projectId);
  localStorage.setItem("lab_note_hidden_projects", JSON.stringify(Array.from(hiddenProjects)));
  renderHiddenProjectsModalList();
  refreshProjectsAndTree();
}

function openHiddenProjectsModal() {
  renderHiddenProjectsModalList();
  document.getElementById("hidden-projects-modal").style.display = "flex";
}

function renderHiddenProjectsModalList() {
  const container = document.getElementById("hidden-projects-list");
  if (!container) return;

  const hiddenArray = Array.from(hiddenProjects);
  if (hiddenArray.length === 0) {
    container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">非表示になっているプロジェクトはありません。</span>';
    return;
  }

  container.innerHTML = hiddenArray.map(pid => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #f8fafc; border: 1px solid var(--border); border-radius: 4px;">
      <span style="font-size: 0.85rem; font-weight: 500;">📁 ${pid}</span>
      <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.75rem;" onclick="restoreProject('${pid}')">
        表示に戻す
      </button>
    </div>
  `).join("");
}

function toggleProjectExpand(projectId) {
  if (expandedProjects.has(projectId)) {
    expandedProjects.delete(projectId);
  } else {
    expandedProjects.add(projectId);
  }
  renderProjectsTree();
}

function selectProject(projectId) {
  if (currentSelectedProjectId === projectId) {
    toggleProjectExpand(projectId);
  } else {
    currentSelectedProjectId = projectId;
    expandedProjects.add(projectId);
    renderProjectsTree();
  }
  
  showView("experiments");
  filterAndRenderExperiments();
}

function viewAllProjects() {
  currentSelectedProjectId = null;
  renderProjectsTree();
  showView("experiments");
  filterAndRenderExperiments();
}

function renderTagFilters() {
  const container = document.getElementById("tag-filters");
  if (!container) return;

  const tags = new Set();
  const visibleProjects = allProjects.filter(p => !hiddenProjects.has(p.id));
  const targetList = allExperiments.filter(e => {
    const isVisibleProj = visibleProjects.some(p => p.id === e.project_id);
    const matchesProj = !currentSelectedProjectId || e.project_id === currentSelectedProjectId;
    return isVisibleProj && matchesProj;
  });

  targetList.forEach((exp) => {
    (exp.tags || []).forEach((t) => tags.add(t));
  });

  let html = `<div class="filter-chip ${selectedTag === null ? "active" : ""}" onclick="selectTag(null)">すべて</div>`;
  tags.forEach((tag) => {
    html += `<div class="filter-chip ${selectedTag === tag ? "active" : ""}" onclick="selectTag('${tag}')">#${tag}</div>`;
  });
  container.innerHTML = html;
}

function selectTag(tag) {
  selectedTag = tag;
  renderTagFilters();
  const searchInput = document.getElementById("search-input");
  filterAndRenderExperiments(searchInput ? searchInput.value : "");
}

function filterAndRenderExperiments(query = "") {
  const container = document.getElementById("experiments-grid");
  const titleEl = document.getElementById("experiments-view-title");
  const descEl = document.getElementById("experiments-view-desc");
  if (!container) return;

  if (currentSelectedProjectId) {
    const projObj = allProjects.find(p => p.id === currentSelectedProjectId);
    if (titleEl) titleEl.textContent = `テーマ: ${currentSelectedProjectId}`;
    if (descEl) descEl.textContent = projObj?.description || "このプロジェクト配下の実験ノート一覧";
  } else {
    if (titleEl) titleEl.textContent = "すべての実験ノート";
    if (descEl) descEl.textContent = "全プロジェクト横断の実験プロトコル実施結果・記録";
  }

  const q = query.toLowerCase().trim();
  const visibleProjects = allProjects.filter(p => !hiddenProjects.has(p.id));

  const filtered = allExperiments.filter((exp) => {
    const isVisibleProj = visibleProjects.some(p => p.id === exp.project_id);
    if (!isVisibleProj) return false;

    const matchesProject = !currentSelectedProjectId || exp.project_id === currentSelectedProjectId;
    const matchesTag = !selectedTag || (exp.tags && exp.tags.includes(selectedTag));
    const matchesQuery =
      !q ||
      exp.title.toLowerCase().includes(q) ||
      (exp.tags && exp.tags.some((t) => t.toLowerCase().includes(q))) ||
      (exp.project_id && exp.project_id.toLowerCase().includes(q));
    return matchesProject && matchesTag && matchesQuery;
  });

  // 進行中 > 完了 が第1優先、その次に実施日の早い順（昇順）、ノート名（タイトル）昇順
  filtered.sort((a, b) => {
    const statusScoreA = a.status === "completed" ? 1 : 0;
    const statusScoreB = b.status === "completed" ? 1 : 0;
    if (statusScoreA !== statusScoreB) return statusScoreA - statusScoreB;

    const dateA = a.date || "9999-99-99";
    const dateB = b.date || "9999-99-99";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.title || a.id || "").localeCompare(b.title || b.id || "");
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 36px; color: var(--text-muted);">
        <p style="font-size: 1rem; margin-bottom: 6px;">該当する実験ノートが見つかりません</p>
        <p style="font-size: 0.85rem;">「新規実験ノート」ボタンからこのテーマの最初の記録を作成しましょう！</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map((exp) => {
      const statusClass = `status-${exp.status || "in_progress"}`;
      const statusText = exp.status === "completed" ? "完了" : "進行中";
      const tagsHtml = (exp.tags || [])
        .map((t) => `<span class="tag-badge">#${t}</span>`)
        .join("");

      return `
      <div class="card" onclick="openEditorForExperiment('${exp.project_id}', '${exp.id}')"
           oncontextmenu="handleExperimentContextMenu(event, '${exp.project_id}', '${exp.id}')">
        <div>
          <div class="card-top">
            <span class="project-badge">📁 ${exp.project_id}</span>
            <span class="status-badge ${statusClass}">${statusText}</span>
          </div>
          <div class="card-title">${exp.title}</div>
          <div class="card-tags">${tagsHtml}</div>
        </div>
        <div class="card-footer">
          <span>📅 ${formatDate(exp.date)}</span>
          <span>📎 ${exp.attachment_count || 0} 件</span>
        </div>
      </div>
    `;
    })
    .join("");
}

// ==========================================
// In-Place Editor Operations
// ==========================================

async function openEditorForNew(projectId = null) {
  const visibleProjects = allProjects.filter(p => !hiddenProjects.has(p.id));
  currentEditingProjectId = projectId || currentSelectedProjectId || (visibleProjects[0]?.id || "");
  currentEditingExpId = null;

  showView("editor");
  document.getElementById("editor-page-heading").textContent = "新規実験ノート作成";

  await populateProjectSelect(currentEditingProjectId);
  editorSelectedProtocolIds.clear();
  await populateProtocolMultiSelect([]);

  document.getElementById("input-project").disabled = false;
  document.getElementById("input-title").value = "";
  document.getElementById("input-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("input-status").value = "in_progress";
  document.getElementById("input-tags").value = "";
  document.getElementById("markdown-input").value = generateInitialMarkdownWithProtocols([]);

  updatePreview();
  renderAttachments([]);
  toggleEditorMetaCard(false);
  updateCollapsedMetaSummary();

  document.getElementById("btn-delete-exp").style.display = "none";
}

async function openEditorForExperiment(projectId, expId) {
  currentEditingProjectId = projectId;
  currentEditingExpId = expId;

  expandedProjects.add(projectId);
  renderProjectsTree();

  showView("editor");
  document.getElementById("editor-page-heading").textContent = "実験ノートの編集";

  await populateProjectSelect(projectId);

  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(expId)}`);
    if (!res.ok) throw new Error("ノートの取得に失敗しました");
    const exp = await res.json();

    const projSelect = document.getElementById("input-project");
    projSelect.value = exp.project_id;
    projSelect.disabled = true;

    document.getElementById("input-title").value = exp.title || "";
    document.getElementById("input-date").value = exp.date || "";
    document.getElementById("input-status").value = exp.status || "in_progress";
    document.getElementById("input-tags").value = (exp.tags || []).join(", ");
    document.getElementById("markdown-input").value = exp.content || "";

    editorSelectedProtocolIds.clear();
    if (exp.protocol_id) {
      exp.protocol_id.split(",").map(s => s.trim()).filter(Boolean).forEach(id => editorSelectedProtocolIds.add(id));
    }
    if (Array.isArray(exp.protocol_ids)) {
      exp.protocol_ids.forEach(id => editorSelectedProtocolIds.add(id));
    }
    await populateProtocolMultiSelect(Array.from(editorSelectedProtocolIds));

    renderAttachments(exp.attachments || []);
    updatePreview();
    updateCollapsedMetaSummary();

    document.getElementById("btn-delete-exp").style.display = "inline-flex";
  } catch (e) {
    showToast("エラー: " + e.message, "error");
    backToExperimentList();
  }
}

// Duplicate experiment to editor (prefilled, uncommitted state)
async function duplicateExperimentToEditor(projectId, expId) {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(expId)}`);
    if (!res.ok) throw new Error("複製元ノートの読み込みに失敗しました");
    const original = await res.json();

    await openEditorForNew(projectId);
    document.getElementById("editor-page-heading").textContent = "新規実験ノート作成 (複製)";

    document.getElementById("input-project").value = projectId;
    document.getElementById("input-title").value = `${original.title} (コピー)`;
    document.getElementById("input-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("input-status").value = "in_progress";
    document.getElementById("input-tags").value = (original.tags || []).join(", ");
    
    editorSelectedProtocolIds.clear();
    if (original.protocol_id) {
      original.protocol_id.split(",").map(s => s.trim()).filter(Boolean).forEach(id => editorSelectedProtocolIds.add(id));
    }
    if (Array.isArray(original.protocol_ids)) {
      original.protocol_ids.forEach(id => editorSelectedProtocolIds.add(id));
    }
    await populateProtocolMultiSelect(Array.from(editorSelectedProtocolIds));

    document.getElementById("markdown-input").value = original.content || "";

    updatePreview();
  } catch (e) {
    showToast("複製エラー: " + e.message, "error");
  }
}

async function populateProjectSelect(selectedProjectId = null) {
  const selectEl = document.getElementById("input-project");
  if (!selectEl) return;
  selectEl.innerHTML = '<option value="">-- 研究テーマを選択 * --</option>';
  const visibleProjects = allProjects.filter(p => !hiddenProjects.has(p.id));
  visibleProjects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `📁 ${p.id}`;
    if (p.id === selectedProjectId) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  });
}

// ==========================================
// Protocol Multi-Select Component Logic
// ==========================================

async function populateProtocolMultiSelect(selectedIds = []) {
  editorSelectedProtocolIds = new Set(selectedIds);
  try {
    const res = await fetch("/api/protocols");
    allProtocols = await res.json();
    renderProtocolCheckboxList();
    updateProtocolMultiSelectUI();
  } catch (e) {
    console.error("Error populating protocol multiselect", e);
  }
}

// Legacy fallback helper
async function populateProtocolSelect(selectedProtocolId = null) {
  await populateProtocolMultiSelect(selectedProtocolId ? [selectedProtocolId] : []);
}

function renderProtocolCheckboxList(filterText = "") {
  const listEl = document.getElementById("protocol-checkbox-list");
  if (!listEl) return;

  const query = (filterText || "").toLowerCase().trim();
  const filtered = allProtocols.filter(p => {
    if (!query) return true;
    return (p.title && p.title.toLowerCase().includes(query)) ||
           (p.id && p.id.toLowerCase().includes(query)) ||
           (p.category && p.category.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="padding: 10px; color: var(--text-muted); font-size: 0.8rem; text-align: center;">該当するプロトコルがありません</div>';
    return;
  }

  listEl.innerHTML = filtered.map(p => {
    const isChecked = editorSelectedProtocolIds.has(p.id);
    return `
      <label class="protocol-option-item" onclick="event.stopPropagation()">
        <input type="checkbox" value="${p.id}" ${isChecked ? "checked" : ""} onchange="onProtocolOptionToggled('${p.id}', this.checked)">
        <div class="protocol-option-label">
          <span class="protocol-option-title">${escapeHtml(p.title)}</span>
          <span class="protocol-option-sub">🏷️ ${p.id} (${escapeHtml(p.category || "General")})</span>
        </div>
      </label>
    `;
  }).join("");
}

function updateProtocolMultiSelectUI() {
  const tagsContainer = document.getElementById("protocol-selected-tags");
  if (!tagsContainer) return;

  if (editorSelectedProtocolIds.size === 0) {
    tagsContainer.innerHTML = '<span class="protocol-placeholder" id="protocol-placeholder">(プロトコルなし)</span>';
  } else {
    tagsContainer.innerHTML = Array.from(editorSelectedProtocolIds).map(id => {
      const proto = allProtocols.find(p => p.id === id);
      const title = proto ? proto.title : id;
      return `
        <span class="protocol-tag-chip" title="管理ID: ${id}">
          <span>${escapeHtml(title)}</span>
          <button type="button" class="chip-del-btn" onclick="event.stopPropagation(); removeSelectedProtocol('${id}')">&times;</button>
        </span>
      `;
    }).join("");
  }

  // 同期チェックボックス
  const checkboxes = document.querySelectorAll("#protocol-checkbox-list input[type='checkbox']");
  checkboxes.forEach(cb => {
    cb.checked = editorSelectedProtocolIds.has(cb.value);
  });
}

function toggleProtocolDropdown(event) {
  if (event) event.stopPropagation();
  const panel = document.getElementById("protocol-dropdown-panel");
  const trigger = document.getElementById("protocol-select-trigger");
  if (!panel) return;
  const isOpen = panel.style.display !== "none";
  if (isOpen) {
    closeProtocolDropdown();
  } else {
    panel.style.display = "flex";
    if (trigger) trigger.classList.add("active");
    const searchInput = document.getElementById("protocol-search-input");
    if (searchInput) {
      searchInput.value = "";
      renderProtocolCheckboxList("");
      setTimeout(() => searchInput.focus(), 50);
    }
  }
}

function closeProtocolDropdown() {
  const panel = document.getElementById("protocol-dropdown-panel");
  const trigger = document.getElementById("protocol-select-trigger");
  if (panel) panel.style.display = "none";
  if (trigger) trigger.classList.remove("active");
}

function filterProtocolDropdown(val) {
  renderProtocolCheckboxList(val);
}

function onProtocolOptionToggled(protoId, isChecked) {
  if (isChecked) {
    editorSelectedProtocolIds.add(protoId);
  } else {
    editorSelectedProtocolIds.delete(protoId);
  }
  updateProtocolMultiSelectUI();
  updateMarkdownWithProtocols();
}

function removeSelectedProtocol(protoId) {
  editorSelectedProtocolIds.delete(protoId);
  updateProtocolMultiSelectUI();
  updateMarkdownWithProtocols();
}

// Generate Requirement 5 Markdown format
function generateInitialMarkdownWithProtocols(protoIds) {
  if (!protoIds || protoIds.length === 0) {
    return `## 目的\n\n## 実験手順・方法\n- [ ] ステップ1\n- [ ] ステップ2\n\n## 結果\n- \n\n## 考察\n`;
  }

  const links = protoIds.map(id => {
    const proto = allProtocols.find(p => p.id === id);
    const title = proto ? proto.title : id;
    return `- [プロトコル] [${title} (${id})](/protocols/${id}/preview)`;
  }).join("\n");

  return `## 目的\n\n## 実験手順・方法\n${links}\n\n## 結果\n- \n\n## 考察\n`;
}

function updateMarkdownWithProtocols() {
  const inputEl = document.getElementById("markdown-input");
  if (!inputEl) return;
  const currentText = inputEl.value;
  const protoIds = Array.from(editorSelectedProtocolIds);

  const isDefaultOrEmpty = !currentText.trim() || 
    (currentText.includes("## 目的") && currentText.includes("## 実験手順・方法") && currentText.includes("## 結果") && currentText.includes("## 考察"));

  const protoLinksStr = protoIds.length > 0
    ? protoIds.map(id => {
        const proto = allProtocols.find(p => p.id === id);
        const title = proto ? proto.title : id;
        return `- [プロトコル] [${title} (${id})](/protocols/${id}/preview)`;
      }).join("\n")
    : "- [ ] ステップ1\n- [ ] ステップ2";

  if (isDefaultOrEmpty) {
    const regex = /(## 実験手順・方法\s*\n)([\s\S]*?)(\n\s*## 結果)/;
    if (regex.test(currentText)) {
      inputEl.value = currentText.replace(regex, `$1${protoLinksStr}\n$3`);
    } else {
      inputEl.value = generateInitialMarkdownWithProtocols(protoIds);
    }
  } else {
    // 既存ノートの場合
    const regex = /(## 実験手順・方法\s*\n)([\s\S]*?)(\n\s*## 結果)/;
    if (regex.test(currentText)) {
      inputEl.value = currentText.replace(regex, `$1${protoLinksStr}\n$3`);
    } else {
      inputEl.value = currentText + `\n\n## 実験手順・方法\n${protoLinksStr}\n`;
    }
  }

  // 自動タイトル補完
  const titleInput = document.getElementById("input-title");
  if (titleInput && !titleInput.value.trim() && protoIds.length > 0) {
    const firstProto = allProtocols.find(p => p.id === protoIds[0]);
    if (firstProto) {
      titleInput.value = protoIds.length === 1 ? `${firstProto.title}の検討` : `${firstProto.title} 等の検討`;
    }
  }

  updatePreview();
}

async function applyProtocolTemplate(protocolId) {
  if (protocolId) {
    editorSelectedProtocolIds.add(protocolId);
    updateProtocolMultiSelectUI();
    updateMarkdownWithProtocols();
  }
}

function onProtocolDropdownChange(protocolId) {
  if (!protocolId) return;
  applyProtocolTemplate(protocolId);
}

function updatePreview() {
  const markdownText = document.getElementById("markdown-input").value;
  const previewContainer = document.getElementById("markdown-preview");
  if (!previewContainer) return;

  if (typeof marked !== "undefined") {
    previewContainer.innerHTML = marked.parse(markdownText);
    previewContainer.querySelectorAll("a").forEach(a => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });
  } else {
    previewContainer.textContent = markdownText;
  }
}

async function saveExperiment() {
  const project_id = document.getElementById("input-project").value;
  if (!project_id) {
    showToast("研究テーマ（Project）を選択してください", "warning");
    return;
  }

  const title = document.getElementById("input-title").value.trim();
  if (!title) {
    showToast("実験タイトルを入力してください", "warning");
    return;
  }

  const date = document.getElementById("input-date").value;
  const status = document.getElementById("input-status").value;
  const proto_ids = Array.from(editorSelectedProtocolIds);
  const protocol_id = proto_ids.join(", ");
  const tags = document.getElementById("input-tags")
    .value.split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const content = document.getElementById("markdown-input").value;

  try {
    if (currentEditingExpId) {
      const res = await fetch(`/api/projects/${encodeURIComponent(currentEditingProjectId)}/experiments/${encodeURIComponent(currentEditingExpId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, date, status, protocol_id, protocol_ids: proto_ids, tags, summary: "", content }),
      });
      if (!res.ok) throw new Error("Update failed");
      showToast("実験ノートを更新しました", "success");
      await refreshProjectsAndTree();
    } else {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id, title, date, status, protocol_id, protocol_ids: proto_ids, tags, summary: "", content }),
      });
      if (!res.ok) throw new Error("Create failed");
      const created = await res.json();
      showToast("実験ノートを作成しました", "success");
      currentEditingExpId = created.id;
      currentEditingProjectId = created.project_id;
      document.getElementById("input-project").disabled = true;
      document.getElementById("btn-delete-exp").style.display = "inline-flex";
      await refreshProjectsAndTree();
    }
  } catch (e) {
    showToast("保存エラー: " + e.message, "error");
  }
}

async function deleteCurrentExperiment() {
  if (!currentEditingProjectId || !currentEditingExpId) return;

  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(currentEditingProjectId)}/experiments/${encodeURIComponent(currentEditingExpId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Delete failed");
    showToast("実験ノートを削除しました", "info");
    await refreshProjectsAndTree();
    backToExperimentList();
  } catch (e) {
    showToast("削除エラー: " + e.message, "error");
  }
}

async function deleteExperimentDirect(projectId, expId) {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(expId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Delete failed");
    showToast("実験ノートを削除しました", "info");
    if (currentEditingProjectId === projectId && currentEditingExpId === expId) {
      backToExperimentList();
    }
    await refreshProjectsAndTree();
  } catch (e) {
    showToast("削除エラー: " + e.message, "error");
  }
}

// PDF Export
function exportCurrentNoteToPdf() {
  window.print();
}

async function exportNoteToPdf(projectId, expId) {
  if (currentEditingProjectId !== projectId || currentEditingExpId !== expId) {
    await openEditorForExperiment(projectId, expId);
    setTimeout(() => {
      window.print();
    }, 300);
  } else {
    window.print();
  }
}

// ==========================================
// Editor Metadata Header Collapse Toggle
// ==========================================

let isEditorMetaCollapsed = false;

function updateCollapsedMetaSummary() {
  const projSelect = document.getElementById("input-project");
  const projName = projSelect && projSelect.selectedIndex >= 0 ? projSelect.options[projSelect.selectedIndex].text : "";
  const title = document.getElementById("input-title")?.value || "";
  const status = document.getElementById("input-status")?.value || "in_progress";

  const projEl = document.getElementById("collapsed-project-name");
  if (projEl) projEl.textContent = `📁 ${projName || "テーマ未選択"}`;

  const titleEl = document.getElementById("collapsed-experiment-title");
  if (titleEl) titleEl.textContent = title ? `📝 ${title}` : "📝 (タイトル未設定)";

  const badgeEl = document.getElementById("collapsed-status-badge");
  if (badgeEl) {
    badgeEl.textContent = status === "completed" ? "✅ 完了" : "⏳ 進行中";
  }
}

function toggleEditorMetaCard(forceState) {
  const card = document.getElementById("editor-header-card");
  const bar = document.getElementById("editor-meta-collapsed-bar");
  if (!card || !bar) return;

  if (typeof forceState === "boolean") {
    isEditorMetaCollapsed = forceState;
  } else {
    isEditorMetaCollapsed = !isEditorMetaCollapsed;
  }

  if (isEditorMetaCollapsed) {
    updateCollapsedMetaSummary();
    card.style.display = "none";
    bar.style.display = "flex";
  } else {
    card.style.display = "block";
    bar.style.display = "none";
  }
}

// ==========================================
// Fullscreen Toggles
// ==========================================

function toggleFullscreenInput() {
  const panes = document.getElementById("editor-panes");
  const icon = document.getElementById("icon-fs-input");

  if (isFullscreenInput) {
    panes.classList.remove("fullscreen-input");
    isFullscreenInput = false;
    icon.innerHTML = SVG_EXPAND;
  } else {
    panes.classList.remove("fullscreen-preview");
    isFullscreenPreview = false;
    document.getElementById("icon-fs-preview").innerHTML = SVG_EXPAND;

    panes.classList.add("fullscreen-input");
    isFullscreenInput = true;
    icon.innerHTML = SVG_COMPRESS;
  }
}

function toggleFullscreenPreview() {
  const panes = document.getElementById("editor-panes");
  const icon = document.getElementById("icon-fs-preview");

  if (isFullscreenPreview) {
    panes.classList.remove("fullscreen-preview");
    isFullscreenPreview = false;
    icon.innerHTML = SVG_EXPAND;
  } else {
    panes.classList.remove("fullscreen-input");
    isFullscreenInput = false;
    document.getElementById("icon-fs-input").innerHTML = SVG_EXPAND;

    panes.classList.add("fullscreen-preview");
    isFullscreenPreview = true;
    icon.innerHTML = SVG_COMPRESS;
  }
}

function resetFullscreen() {
  const panes = document.getElementById("editor-panes");
  if (panes) {
    panes.classList.remove("fullscreen-input");
    panes.classList.remove("fullscreen-preview");
  }
  isFullscreenInput = false;
  isFullscreenPreview = false;
  const iconIn = document.getElementById("icon-fs-input");
  const iconPr = document.getElementById("icon-fs-preview");
  if (iconIn) iconIn.innerHTML = SVG_EXPAND;
  if (iconPr) iconPr.innerHTML = SVG_EXPAND;
}

// ==========================================
// Attachments Handling
// ==========================================

// ==========================================
// Attachments Handling, Drag & Drop, and Table Insertion
// ==========================================

let currentPreviewCsvData = null;

function parseTableTextToMarkdown(text) {
  if (!text || typeof text !== "string") return null;
  const lines = text.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return null; // 少なくともヘッダー+1行は必要

  // タブが含まれているか確認 (Excel/スプレッドシートのコピペ)
  const hasTab = lines.some(l => l.includes("\t"));
  let delimiter = ",";
  if (hasTab) {
    delimiter = "\t";
  } else {
    // タブがなければカンマ区切りチェック
    const commaCounts = lines.map(l => (l.match(/,/g) || []).length);
    const avgCommas = commaCounts.reduce((a, b) => a + b, 0) / lines.length;
    if (avgCommas >= 1 && commaCounts.every(c => Math.abs(c - commaCounts[0]) <= 1)) {
      delimiter = ",";
    } else {
      return null; // 表形式とみなさない
    }
  }

  const rows = lines.map(line => {
    if (delimiter === "\t") {
      return line.split("\t").map(cell => cell.trim());
    } else {
      return line.split(",").map(cell => cell.trim().replace(/^"(.*)"$/, "$1"));
    }
  });

  const colCount = Math.max(...rows.map(r => r.length));
  if (colCount <= 1) return null;

  const header = rows[0];
  while (header.length < colCount) header.push("");
  const headerRow = `| ${header.map(c => c || " ").join(" | ")} |`;
  const sepRow = `| ${header.map(() => "---").join(" | ")} |`;
  const dataRows = rows.slice(1).map(row => {
    const r = [...row];
    while (r.length < colCount) r.push("");
    return `| ${r.map(c => c || " ").join(" | ")} |`;
  });

  return [headerRow, sepRow, ...dataRows].join("\n");
}

function insertTextAtCursor(textarea, text, targetPos = null) {
  if (!textarea) return;
  const val = textarea.value;
  let start = textarea.selectionStart !== undefined ? textarea.selectionStart : val.length;
  let end = textarea.selectionEnd !== undefined ? textarea.selectionEnd : val.length;

  if (typeof targetPos === "number" && targetPos >= 0) {
    start = targetPos;
    end = targetPos;
  }

  const before = val.substring(0, start);
  const after = val.substring(end);

  const prefix = (start > 0 && !before.endsWith("\n\n")) ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const suffix = (!after.startsWith("\n\n")) ? (after.startsWith("\n") ? "\n" : "\n\n") : "";

  const insertion = prefix + text.trim() + suffix;
  textarea.value = before + insertion + after;

  const newPos = start + insertion.length;
  textarea.selectionStart = newPos;
  textarea.selectionEnd = newPos;
  textarea.focus();
  updatePreview();
}

function initEditorDragAndPaste(textarea) {
  if (!textarea) return;

  // ドラッグオーバー
  textarea.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    textarea.classList.add("drag-over");
  });

  textarea.addEventListener("dragleave", () => {
    textarea.classList.remove("drag-over");
  });

  // ドロップ
  textarea.addEventListener("drop", async (e) => {
    e.preventDefault();
    textarea.classList.remove("drag-over");

    let dropPos = null;
    if (typeof textarea.selectionStart === "number") {
      dropPos = textarea.selectionStart;
    }

    const attJson = e.dataTransfer.getData("application/lab-note-att");
    if (attJson) {
      try {
        const att = JSON.parse(attJson);
        if (att.is_csv) {
          await insertCsvAsMarkdownTable(att, textarea, dropPos);
        } else if (att.is_image) {
          insertTextAtCursor(textarea, `![${att.filename}](${att.rel_path})`, dropPos);
          showToast(`図「${att.filename}」を挿入しました`, "info");
        } else {
          insertTextAtCursor(textarea, `[📎 ${att.filename}](${att.rel_path})`, dropPos);
          showToast(`添付リンクを挿入しました`, "info");
        }
        return;
      } catch (err) {
        console.error("Drop att parse failed", err);
      }
    }

    // 通常のプレーンテキストドロップ
    const text = e.dataTransfer.getData("text/plain");
    if (text) {
      insertTextAtCursor(textarea, text, dropPos);
    }
  });

  // 案C: Excel/スプレッドシートからの直接コピペ自動Markdown表変換
  textarea.addEventListener("paste", (e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    const text = clipboardData.getData("text/plain");
    if (!text) return;

    const mdTable = parseTableTextToMarkdown(text);
    if (mdTable) {
      e.preventDefault();
      insertTextAtCursor(textarea, mdTable);
      showToast("Excelの表をMarkdown表形式に自動変換して挿入しました", "success");
    }
  });
}

function handleAttachmentDragStart(event, attJsonStr) {
  try {
    const att = typeof attJsonStr === "string" ? JSON.parse(attJsonStr) : attJsonStr;
    event.dataTransfer.setData("application/lab-note-att", JSON.stringify(att));
    
    // フォールバック用テキスト
    if (att.is_image) {
      event.dataTransfer.setData("text/plain", `![${att.filename}](${att.rel_path})`);
    } else if (att.is_csv) {
      event.dataTransfer.setData("text/plain", `[📊 ${att.filename}](${att.rel_path})`);
    } else {
      event.dataTransfer.setData("text/plain", `[📎 ${att.filename}](${att.rel_path})`);
    }
    
    event.dataTransfer.effectAllowed = "copy";
    event.target.classList.add("dragging");
  } catch (e) {
    console.error("handleAttachmentDragStart error", e);
  }
}

function handleAttachmentDragEnd(event) {
  event.target.classList.remove("dragging");
}

async function insertAttachmentToEditor(attJsonStr) {
  try {
    const att = typeof attJsonStr === "string" ? JSON.parse(attJsonStr) : attJsonStr;
    const textarea = document.getElementById("markdown-input");
    if (!textarea) return;

    if (att.is_image) {
      insertTextAtCursor(textarea, `![${att.filename}](${att.rel_path})`);
      showToast(`図「${att.filename}」を本文に挿入しました`, "info");
    } else if (att.is_csv) {
      await insertCsvAsMarkdownTable(att, textarea);
    } else {
      insertTextAtCursor(textarea, `[📎 ${att.filename}](${att.rel_path})`);
      showToast(`ファイルリンクを本文に挿入しました`, "info");
    }
  } catch (e) {
    console.error("insertAttachmentToEditor error", e);
  }
}

async function insertCsvAsMarkdownTable(att, textarea, targetPos = null) {
  if (!currentEditingProjectId || !currentEditingExpId) return;
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(currentEditingProjectId)}/experiments/${encodeURIComponent(currentEditingExpId)}/preview-csv/${encodeURIComponent(att.filename)}?limit=100`);
    if (!res.ok) throw new Error("CSVデータの取得に失敗しました");
    const data = await res.json();
    
    if (!data.headers || data.headers.length === 0) {
      insertTextAtCursor(textarea, `[📊 ${att.filename}](${att.rel_path})`, targetPos);
      return;
    }

    const colCount = Math.max(data.headers.length, ...(data.rows || []).map(r => r.length));
    const header = [...data.headers];
    while (header.length < colCount) header.push("");
    
    const headerRow = `| ${header.map(c => c || " ").join(" | ")} |`;
    const sepRow = `| ${header.map(() => "---").join(" | ")} |`;
    const dataRows = (data.rows || []).map(row => {
      const r = [...row];
      while (r.length < colCount) r.push("");
      return `| ${r.map(c => c || " ").join(" | ")} |`;
    });

    const tableMd = `### 表：${att.filename}\n` + [headerRow, sepRow, ...dataRows].join("\n");
    insertTextAtCursor(textarea, tableMd, targetPos);
    showToast(`表「${att.filename}」をMarkdown表として挿入しました`, "success");
  } catch (e) {
    insertTextAtCursor(textarea, `[📊 ${att.filename}](${att.rel_path})`, targetPos);
    showToast("CSV表の挿入エラー: " + e.message, "warning");
  }
}

function renderAttachments(attachments) {
  const container = document.getElementById("attachments-list");
  if (!container) return;

  if (attachments.length === 0) {
    container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.78rem;">なし</span>';
    return;
  }

  container.innerHTML = attachments
    .map((att) => {
      let icon = "📄";
      let actionBtn = "";
      if (att.is_image) {
        icon = "🖼️";
        actionBtn = `<a href="${att.rel_path}" target="_blank" class="btn btn-secondary" style="padding: 1px 5px; font-size: 0.72rem;">拡大</a>`;
      } else if (att.is_csv) {
        icon = "📊";
        actionBtn = `<button type="button" onclick="viewCsvPreview('${att.filename}')" class="btn btn-secondary" style="padding: 1px 5px; font-size: 0.72rem;">表</button>`;
      }

      const safeAttStr = encodeURIComponent(JSON.stringify(att));

      return `
      <div class="attachment-pill" draggable="true" 
           ondragstart="handleAttachmentDragStart(event, decodeURIComponent('${safeAttStr}'))"
           ondragend="handleAttachmentDragEnd(event)"
           title="ドラッグしてMarkdownに挿入できます（画像は図として、CSV/TSVはMarkdown表として挿入）">
        <span style="font-size: 0.95rem;">${icon}</span>
        <a href="${att.rel_path}" download style="color: var(--text-main); text-decoration: none; font-weight: 500;">
          ${att.filename}
        </a>
        ${actionBtn}
        <button type="button" class="btn btn-secondary" style="padding: 1px 5px; font-size: 0.72rem;"
                title="本文のカーソル位置に挿入" 
                onclick="insertAttachmentToEditor(decodeURIComponent('${safeAttStr}'))">
          ➕ 挿入
        </button>
        <button onclick="deleteAttachment('${att.filename}')" style="background:none; border:none; color: var(--danger); cursor:pointer; font-weight:bold; margin-left: 2px;" title="削除">&times;</button>
      </div>
    `;
    })
    .join("");
}

function triggerFileUpload() {
  if (!currentEditingProjectId || !currentEditingExpId) {
    showToast("ファイルを添付する前に、一度「保存する」ボタンを押して実験ノートを作成してください", "warning");
    return;
  }
  document.getElementById("file-upload-input").click();
}

async function uploadFile() {
  const fileInput = document.getElementById("file-upload-input");
  if (!fileInput || !fileInput.files.length || !currentEditingProjectId || !currentEditingExpId) return;

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(currentEditingProjectId)}/experiments/${encodeURIComponent(currentEditingExpId)}/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    fileInput.value = "";
    showToast(`ファイル「${file.name}」を添付しました`, "success");
    await openEditorForExperiment(currentEditingProjectId, currentEditingExpId);
  } catch (e) {
    showToast("アップロード失敗: " + e.message, "error");
  }
}

async function deleteAttachment(filename) {
  if (!currentEditingProjectId || !currentEditingExpId) return;

  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(currentEditingProjectId)}/experiments/${encodeURIComponent(currentEditingExpId)}/files/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Delete failed");
    showToast("添付ファイルを削除しました", "info");
    await openEditorForExperiment(currentEditingProjectId, currentEditingExpId);
  } catch (e) {
    showToast("添付削除エラー: " + e.message, "error");
  }
}

async function viewCsvPreview(filename) {
  if (!currentEditingProjectId || !currentEditingExpId) return;
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(currentEditingProjectId)}/experiments/${encodeURIComponent(currentEditingExpId)}/preview-csv/${encodeURIComponent(filename)}?limit=100`);
    if (!res.ok) throw new Error("CSV preview failed");
    const data = await res.json();
    currentPreviewCsvData = { filename, data };

    let tableHtml = '<table style="width: 100%; border-collapse: collapse; font-size: 0.82rem;"><thead><tr>';
    data.headers.forEach((h) => {
      tableHtml += `<th style="border: 1px solid #cbd5e1; padding: 5px 8px; background: #f8fafc;">${h}</th>`;
    });
    tableHtml += "</tr></thead><tbody>";
    data.rows.forEach((row) => {
      tableHtml += "<tr>";
      row.forEach((cell) => {
        tableHtml += `<td style="border: 1px solid #e2e8f0; padding: 5px 8px;">${cell}</td>`;
      });
      tableHtml += "</tr>";
    });
    tableHtml += "</tbody></table>";

    document.getElementById("csv-modal-content").innerHTML = tableHtml;
    document.getElementById("csv-modal-title").textContent = `CSVプレビュー: ${filename}`;
    document.getElementById("csv-modal").style.display = "flex";
  } catch (e) {
    showToast("CSVプレビュー取得エラー: " + e.message, "error");
  }
}

function insertCurrentCsvModalToEditor() {
  if (!currentPreviewCsvData || !currentPreviewCsvData.data) {
    showToast("挿入可能なCSVデータがありません", "warning");
    return;
  }
  const textarea = document.getElementById("markdown-input");
  if (!textarea) return;

  const { filename, data } = currentPreviewCsvData;
  if (!data.headers || data.headers.length === 0) {
    showToast("表データが空です", "warning");
    return;
  }

  const colCount = Math.max(data.headers.length, ...(data.rows || []).map(r => r.length));
  const header = [...data.headers];
  while (header.length < colCount) header.push("");

  const headerRow = `| ${header.map(c => c || " ").join(" | ")} |`;
  const sepRow = `| ${header.map(() => "---").join(" | ")} |`;
  const dataRows = (data.rows || []).map(row => {
    const r = [...row];
    while (r.length < colCount) r.push("");
    return `| ${r.map(c => c || " ").join(" | ")} |`;
  });

  const tableMd = `### 表：${filename}\n` + [headerRow, sepRow, ...dataRows].join("\n");
  insertTextAtCursor(textarea, tableMd);
  closeModal("csv-modal");
  showToast(`表「${filename}」をMarkdown表として挿入しました`, "success");
}

// ==========================================
// Protocol Management & Context Menu
// ==========================================

async function loadProtocols() {
  try {
    const res = await fetch("/api/protocols");
    allProtocols = await res.json();
    const container = document.getElementById("protocols-grid");
    if (!container) return;

    if (allProtocols.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 36px; color: var(--text-muted);">
          <p style="font-size: 1rem; margin-bottom: 6px;">登録されているプロトコルがありません</p>
          <p style="font-size: 0.85rem;">「新規プロトコル」ボタンから実験手順のテンプレートを登録してください。</p>
        </div>`;
      return;
    }

    container.innerHTML = allProtocols
      .map((proto) => {
        const isSelected = selectedProtocolIds.has(proto.id);
        const tagsHtml = (proto.tags || [])
          .map((t) => `<span class="tag-badge">#${escapeHtml(t)}</span>`)
          .join("");
        return `
        <div class="card ${isSelected ? 'card-selected' : ''}" 
             id="proto-card-${proto.id}" 
             onclick="toggleProtocolCardSelection('${proto.id}', event)" 
             oncontextmenu="handleProtocolContextMenu(event, '${proto.id}')">
          <div class="card-select-badge">✓</div>
          <div>
            <div class="card-top" style="margin-bottom: 2px;">
              <span class="protocol-id-badge" style="font-family: monospace; font-size: 0.8rem; font-weight: 700; color: #2563eb; background: #eff6ff; border: 1px solid #bfdbfe; padding: 1px 6px; border-radius: 4px;" title="管理ID: ${proto.id}">🏷️ ${proto.id}</span>
              <span class="sidebar-badge">v${proto.version || "1.0"}</span>
            </div>
            <div class="card-title" style="margin-top: 4px;">${escapeHtml(proto.title)}</div>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 8px;">${escapeHtml(proto.description || "")}</div>
            <div class="card-tags">${tagsHtml}</div>
          </div>
          <div class="card-footer" onclick="event.stopPropagation()">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>🗂️ ${escapeHtml(proto.category || "General")}</span>
              ${proto.attachments && proto.attachments.length > 0 ? `<span style="font-size: 0.78rem; color: var(--text-muted);" title="${proto.attachments.length}個の参考添付ファイル">📎 ${proto.attachments.length}</span>` : ""}
            </div>
            <div style="display: flex; gap: 6px;">
              <a class="btn btn-secondary" style="padding: 3px 6px; font-size: 0.75rem; text-decoration: none;" 
                 href="/protocols/${encodeURIComponent(proto.id)}/preview" target="_blank" onclick="event.stopPropagation()">
                👁️ プレビュー
              </a>
              <button class="btn btn-secondary" style="padding: 3px 6px; font-size: 0.75rem;" 
                onclick="event.stopPropagation(); startExperimentFromSingleProtocol('${proto.id}')">
                ⚡ 実験開始
              </button>
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    updateProtocolCardSelectionUI();
  } catch (e) {
    console.error("Error loading protocols", e);
  }
}

// Left-click card multi-select handling
function toggleProtocolCardSelection(protoId, event) {
  if (selectedProtocolIds.has(protoId)) {
    selectedProtocolIds.delete(protoId);
  } else {
    selectedProtocolIds.add(protoId);
  }
  updateProtocolCardSelectionUI();
}

function updateProtocolCardSelectionUI() {
  allProtocols.forEach(p => {
    const el = document.getElementById(`proto-card-${p.id}`);
    if (el) {
      if (selectedProtocolIds.has(p.id)) {
        el.classList.add("card-selected");
      } else {
        el.classList.remove("card-selected");
      }
    }
  });

  const actions = document.getElementById("protocol-selection-actions");
  const countBadge = document.getElementById("protocol-selected-count-badge");
  const count = selectedProtocolIds.size;
  if (actions && countBadge) {
    if (count > 0) {
      actions.style.display = "flex";
      countBadge.textContent = `${count}件選択中`;
    } else {
      actions.style.display = "none";
    }
  }
}

function clearProtocolSelection() {
  selectedProtocolIds.clear();
  updateProtocolCardSelectionUI();
}

// Right-click on protocol card (Requirement 4)
function handleProtocolContextMenu(event, protoId) {
  event.preventDefault();
  event.stopPropagation();

  // If the right-clicked protocol is not selected yet, select it
  if (!selectedProtocolIds.has(protoId)) {
    selectedProtocolIds.add(protoId);
    updateProtocolCardSelectionUI();
  }

  const count = selectedProtocolIds.size;
  const label = count > 1
    ? `選択したプロトコルからノートを作成 (${count}件)`
    : "選択したプロトコルからノートを作成";

  const items = [
    {
      icon: "📝",
      label: label,
      action: () => startExperimentFromSelectedProtocols()
    },
    { divider: true },
    {
      icon: "👁️",
      label: "プレビューを別画面で表示",
      action: () => window.open(`/protocols/${encodeURIComponent(protoId)}/preview`, "_blank")
    },
    {
      icon: "✏️",
      label: "編集",
      action: () => editProtocol(protoId)
    },
    {
      icon: "📋",
      label: "複製 (登録画面で編集)",
      action: () => duplicateProtocol(protoId)
    },
    { divider: true },
    {
      icon: "🗑️",
      label: "削除",
      action: () => deleteProtocolDirect(protoId)
    }
  ];

  showContextMenu(event.clientX, event.clientY, items);
}

// ==========================================
// Protocol Attachments & Modal Management
// ==========================================

let pendingProtoFiles = [];
let currentProtoAttachments = [];

function renderProtoAttachments() {
  const listEl = document.getElementById("proto-attachments-list");
  if (!listEl) return;

  const totalCount = currentProtoAttachments.length + pendingProtoFiles.length;
  if (totalCount === 0) {
    listEl.innerHTML = '<span style="color: var(--text-muted); font-size: 0.76rem;">添付ファイルはありません</span>';
    return;
  }

  let html = "";
  // 既存の添付ファイル
  currentProtoAttachments.forEach((att) => {
    html += `
      <div class="proto-attachment-chip">
        <span>📎</span>
        <a href="${att.rel_path}" target="_blank" title="${att.filename} (${Math.round(att.size / 1024)} KB)">${att.filename}</a>
        <button type="button" class="btn-chip-del" title="削除" onclick="deleteExistingProtoAttachment('${att.saved_name}')">&times;</button>
      </div>
    `;
  });

  // 新規登録時の未保存ファイル
  pendingProtoFiles.forEach((file, idx) => {
    html += `
      <div class="proto-attachment-chip" style="background: #ecfdf5; border-color: #a7f3d0;">
        <span>📄</span>
        <span style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${file.name} (${Math.round(file.size / 1024)} KB)">${file.name} (登録時に保存)</span>
        <button type="button" class="btn-chip-del" title="取り消し" onclick="removePendingProtoFile(${idx})">&times;</button>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

function onProtoFileSelected(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const editId = document.getElementById("proto-edit-id").value.trim();
  if (editId) {
    // 既存プロトコル編集中の場合は即時アップロード
    uploadProtoFilesImmediately(editId, files);
  } else {
    // 新規作成時は保留リストに追加
    files.forEach((f) => pendingProtoFiles.push(f));
    renderProtoAttachments();
  }
  event.target.value = "";
}

async function uploadProtoFilesImmediately(protoId, files) {
  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/protocols/${encodeURIComponent(protoId)}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("アップロードに失敗しました");
      showToast(`添付「${file.name}」を追加しました`, "success");
    } catch (err) {
      showToast(`添付追加エラー: ${err.message}`, "error");
    }
  }
  await reloadProtoAttachmentsForEdit(protoId);
  await loadProtocols();
}

async function reloadProtoAttachmentsForEdit(protoId) {
  try {
    const res = await fetch(`/api/protocols/${encodeURIComponent(protoId)}`);
    if (res.ok) {
      const data = await res.json();
      currentProtoAttachments = data.attachments || [];
      pendingProtoFiles = [];
      renderProtoAttachments();
    }
  } catch (e) {
    console.error("reloadProtoAttachmentsForEdit failed", e);
  }
}

function removePendingProtoFile(index) {
  pendingProtoFiles.splice(index, 1);
  renderProtoAttachments();
}

async function deleteExistingProtoAttachment(savedName) {
  const editId = document.getElementById("proto-edit-id").value.trim();
  if (!editId) return;

  try {
    const res = await fetch(`/api/protocols/${encodeURIComponent(editId)}/files/${encodeURIComponent(savedName)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("削除に失敗しました");
    showToast("添付ファイルを削除しました", "info");
    await reloadProtoAttachmentsForEdit(editId);
    await loadProtocols();
  } catch (e) {
    showToast("添付削除エラー: " + e.message, "error");
  }
}

let protoIdUserEdited = false;
let protoTitleDebounceTimer = null;

async function autoGenerateProtocolId(titleHint) {
  const hint = titleHint !== undefined ? titleHint : (document.getElementById("proto-title")?.value || "");
  try {
    const res = await fetch(`/api/protocols/generate-id?name=${encodeURIComponent(hint)}`);
    if (res.ok) {
      const data = await res.json();
      const idInput = document.getElementById("proto-id-input");
      if (idInput) {
        idInput.value = data.id;
      }
      return data.id;
    }
  } catch (e) {
    console.warn("Failed to fetch generated protocol id from server, calculating fallback", e);
  }

  // クライアント側フォールバック
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yymmdd = `${yy}${mm}${dd}`;
  const cleanName = hint.replace(/[^a-zA-Z0-9_-]/g, "").replace(/\s+/g, "_") || "Protocol";
  let maxNo = 0;
  (allProtocols || []).forEach(p => {
    const m = (p.id || "").match(/^(\d+)-/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNo) maxNo = n;
    }
  });
  const nextNo = String(maxNo + 1).padStart(2, "0");
  const generated = `${nextNo}-${cleanName}-${yymmdd}`;
  const idInput = document.getElementById("proto-id-input");
  if (idInput) {
    idInput.value = generated;
  }
  return generated;
}

function onProtoTitleInput(val) {
  const editId = document.getElementById("proto-edit-id")?.value.trim();
  if (editId) return; // 既存編集時は変更しない
  if (protoIdUserEdited) return; // ユーザーが手動編集した場合は自動更新しない

  clearTimeout(protoTitleDebounceTimer);
  protoTitleDebounceTimer = setTimeout(() => {
    autoGenerateProtocolId(val);
  }, 250);
}

async function openNewProtocolModal() {
  protoIdUserEdited = false;
  document.getElementById("proto-modal-title").textContent = "新規プロトコル作成";
  document.getElementById("proto-edit-id").value = "";

  const idInput = document.getElementById("proto-id-input");
  if (idInput) {
    idInput.readOnly = false;
    idInput.disabled = false;
    idInput.style.backgroundColor = "";
    idInput.value = "";
    idInput.oninput = () => { protoIdUserEdited = true; };
  }

  document.getElementById("proto-title").value = "";
  document.getElementById("proto-category").value = "General";
  document.getElementById("proto-version").value = "1.0";
  document.getElementById("proto-description").value = "";
  document.getElementById("proto-tags").value = "";
  document.getElementById("proto-content").value = "- [ ] ステップ 1\n- [ ] ステップ 2\n- [ ] ステップ 3";
  
  pendingProtoFiles = [];
  currentProtoAttachments = [];
  renderProtoAttachments();
  
  await autoGenerateProtocolId("");
  document.getElementById("protocol-modal").style.display = "flex";
}

async function editProtocol(protoId) {
  try {
    const res = await fetch(`/api/protocols/${encodeURIComponent(protoId)}`);
    if (!res.ok) throw new Error("プロトコルの取得に失敗しました");
    const proto = await res.json();

    document.getElementById("proto-modal-title").textContent = "プロトコルの編集";
    document.getElementById("proto-edit-id").value = proto.id;

    const idInput = document.getElementById("proto-id-input");
    if (idInput) {
      idInput.value = proto.id;
      idInput.readOnly = true;
      idInput.disabled = true;
      idInput.style.backgroundColor = "var(--bg-muted, #f1f5f9)";
    }

    document.getElementById("proto-title").value = proto.title || "";
    document.getElementById("proto-category").value = proto.category || "General";
    document.getElementById("proto-version").value = proto.version || "1.0";
    document.getElementById("proto-description").value = proto.description || "";
    document.getElementById("proto-tags").value = (proto.tags || []).join(", ");
    document.getElementById("proto-content").value = proto.content || "";

    currentProtoAttachments = proto.attachments || [];
    pendingProtoFiles = [];
    renderProtoAttachments();

    document.getElementById("protocol-modal").style.display = "flex";
  } catch (e) {
    showToast("エラー: " + e.message, "error");
  }
}

async function duplicateProtocol(protoId) {
  try {
    const res = await fetch(`/api/protocols/${encodeURIComponent(protoId)}`);
    if (!res.ok) throw new Error("プロトコルの取得に失敗しました");
    const proto = await res.json();

    protoIdUserEdited = false;
    document.getElementById("proto-modal-title").textContent = "新規プロトコル作成 (複製)";
    document.getElementById("proto-edit-id").value = ""; // Clear to treat as new

    const idInput = document.getElementById("proto-id-input");
    if (idInput) {
      idInput.readOnly = false;
      idInput.disabled = false;
      idInput.style.backgroundColor = "";
      idInput.value = "";
      idInput.oninput = () => { protoIdUserEdited = true; };
    }

    const copyTitle = `${proto.title} (コピー)`;
    document.getElementById("proto-title").value = copyTitle;
    document.getElementById("proto-category").value = proto.category || "General";
    document.getElementById("proto-version").value = proto.version || "1.0";
    document.getElementById("proto-description").value = proto.description || "";
    document.getElementById("proto-tags").value = (proto.tags || []).join(", ");
    document.getElementById("proto-content").value = proto.content || "";

    pendingProtoFiles = [];
    currentProtoAttachments = [];
    renderProtoAttachments();

    await autoGenerateProtocolId(copyTitle);
    document.getElementById("protocol-modal").style.display = "flex";
  } catch (e) {
    showToast("エラー: " + e.message, "error");
  }
}

async function deleteProtocolDirect(protoId) {
  try {
    const res = await fetch(`/api/protocols/${encodeURIComponent(protoId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Delete failed");
    showToast("プロトコルを削除しました", "info");
    await loadProtocols();
  } catch (e) {
    showToast("削除エラー: " + e.message, "error");
  }
}

async function saveProtocolFromModal() {
  const title = document.getElementById("proto-title").value.trim();
  if (!title) {
    showToast("プロトコルタイトルを入力してください", "warning");
    return;
  }
  const editId = document.getElementById("proto-edit-id").value.trim();
  const idInput = document.getElementById("proto-id-input");
  const customId = idInput ? idInput.value.trim() : "";

  const category = document.getElementById("proto-category").value.trim() || "General";
  const version = document.getElementById("proto-version").value.trim() || "1.0";
  const description = document.getElementById("proto-description").value.trim();
  const tags = document.getElementById("proto-tags").value.split(",").map(t => t.trim()).filter(t => t);
  const content = document.getElementById("proto-content").value;

  const payload = {
    title,
    category,
    version,
    description,
    tags,
    content
  };
  if (editId) {
    payload.id = editId; // Update existing
  } else if (customId) {
    payload.id = customId; // Custom/generated ID for new
  }

  try {
    const res = await fetch("/api/protocols", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to save protocol");
    const savedProto = await res.json();

    // 新規登録時の添付ファイルをアップロード
    if (pendingProtoFiles.length > 0 && savedProto && savedProto.id) {
      for (const file of pendingProtoFiles) {
        const formData = new FormData();
        formData.append("file", file);
        try {
          await fetch(`/api/protocols/${encodeURIComponent(savedProto.id)}/upload`, {
            method: "POST",
            body: formData
          });
        } catch (e) {
          console.error("Failed to upload proto file", e);
        }
      }
      pendingProtoFiles = [];
    }

    closeModal("protocol-modal");
    await loadProtocols();
    showToast("プロトコルを保存しました", "success");
  } catch (e) {
    showToast("保存エラー: " + e.message, "error");
  }
}

async function startExperimentFromSelectedProtocols() {
  const protoIds = Array.from(selectedProtocolIds);
  if (protoIds.length === 0) {
    showToast("プロトコルが選択されていません", "warning");
    return;
  }

  await openEditorForNew();
  await populateProtocolMultiSelect(protoIds);
  updateMarkdownWithProtocols();
}

async function startExperimentFromSingleProtocol(protoId) {
  await openEditorForNew();
  await populateProtocolMultiSelect([protoId]);
  updateMarkdownWithProtocols();
}

async function startExperimentFromProtocol(protoId) {
  await startExperimentFromSingleProtocol(protoId);
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = "none";
}

// Global click handlers for multi-select dropdown closing and Markdown preview link interception
document.addEventListener("click", (e) => {
  // Close protocol multi-select dropdown if clicked outside
  const multiselect = document.getElementById("protocol-multiselect-container");
  if (multiselect && !multiselect.contains(e.target)) {
    closeProtocolDropdown();
  }

  // Intercept Markdown preview protocol links to open in a new window/tab (Requirement 5)
  const link = e.target.closest("a");
  if (link && link.getAttribute("href")) {
    const href = link.getAttribute("href");
    if (href.startsWith("/protocols/") || href.includes("preview") || href.startsWith("http")) {
      e.preventDefault();
      window.open(href, "_blank");
    }
  }
});


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
let selectedStatusFilter = null;
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
let currentEditingAttachments = [];

// Fullscreen states
let isFullscreenInput = false;
let isFullscreenPreview = false;

document.addEventListener("DOMContentLoaded", () => {
  initApp();
  initResizer();
  initContextMenu();
  initKeyboardShortcuts();
});

async function initApp() {
  initMarkedRenderer();
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

  initAttachmentsBarDragAndDrop();

  const protoMarkdownInput = document.getElementById("proto-markdown-input");
  if (protoMarkdownInput) {
    protoMarkdownInput.addEventListener("input", updateProtoPreview);
    initEditorDragAndPaste(protoMarkdownInput);
  }

  const protoEditTitle = document.getElementById("proto-edit-title");
  if (protoEditTitle) protoEditTitle.addEventListener("input", updateCollapsedProtoSummary);
  const protoEditCategory = document.getElementById("proto-edit-category");
  if (protoEditCategory) protoEditCategory.addEventListener("input", updateCollapsedProtoSummary);
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
  const protoEditView = document.getElementById("view-protocol-editor");

  const searchBox = document.getElementById("global-search-box");
  const editorNavBack = document.getElementById("editor-nav-back");
  const protoEditorNavBack = document.getElementById("proto-editor-nav-back");
  const actionsDashboard = document.getElementById("actions-dashboard");
  const actionsEditor = document.getElementById("actions-editor");
  const actionsProtoEditor = document.getElementById("actions-proto-editor");

  resetFullscreen();
  resetProtoFullscreen();

  if (viewName === "editor") {
    if (expView) expView.style.display = "none";
    if (protoView) protoView.style.display = "none";
    if (protoEditView) protoEditView.style.display = "none";
    if (editView) editView.style.display = "flex";

    if (searchBox) searchBox.style.display = "none";
    if (editorNavBack) editorNavBack.style.display = "flex";
    if (protoEditorNavBack) protoEditorNavBack.style.display = "none";
    if (actionsDashboard) actionsDashboard.style.display = "none";
    if (actionsEditor) actionsEditor.style.display = "flex";
    if (actionsProtoEditor) actionsProtoEditor.style.display = "none";
  } else if (viewName === "protocol-editor") {
    if (expView) expView.style.display = "none";
    if (editView) editView.style.display = "none";
    if (protoView) protoView.style.display = "none";
    if (protoEditView) protoEditView.style.display = "flex";

    if (searchBox) searchBox.style.display = "none";
    if (editorNavBack) editorNavBack.style.display = "none";
    if (protoEditorNavBack) protoEditorNavBack.style.display = "flex";
    if (actionsDashboard) actionsDashboard.style.display = "none";
    if (actionsEditor) actionsEditor.style.display = "none";
    if (actionsProtoEditor) actionsProtoEditor.style.display = "flex";

    document.querySelectorAll(".menu-item").forEach((el) => el.classList.remove("active"));
    const protoMenu = document.getElementById("menu-protocols");
    if (protoMenu) protoMenu.classList.add("active");
  } else if (viewName === "protocols") {
    if (expView) expView.style.display = "none";
    if (editView) editView.style.display = "none";
    if (protoEditView) protoEditView.style.display = "none";
    if (protoView) protoView.style.display = "block";

    if (searchBox) searchBox.style.display = "flex";
    if (editorNavBack) editorNavBack.style.display = "none";
    if (protoEditorNavBack) protoEditorNavBack.style.display = "none";
    if (actionsDashboard) actionsDashboard.style.display = "flex";
    if (actionsEditor) actionsEditor.style.display = "none";
    if (actionsProtoEditor) actionsProtoEditor.style.display = "none";

    document.querySelectorAll(".menu-item").forEach((el) => el.classList.remove("active"));
    const protoMenu = document.getElementById("menu-protocols");
    if (protoMenu) protoMenu.classList.add("active");
    document.title = "電子実験ノート";
  } else {
    if (expView) expView.style.display = "block";
    if (editView) editView.style.display = "none";
    if (protoEditView) protoEditView.style.display = "none";
    if (protoView) protoView.style.display = "none";

    if (searchBox) searchBox.style.display = "flex";
    if (editorNavBack) editorNavBack.style.display = "none";
    if (protoEditorNavBack) protoEditorNavBack.style.display = "none";
    if (actionsDashboard) actionsDashboard.style.display = "flex";
    if (actionsEditor) actionsEditor.style.display = "none";
    if (actionsProtoEditor) actionsProtoEditor.style.display = "none";

    document.querySelectorAll(".menu-item").forEach((el) => el.classList.remove("active"));
    const expMenu = document.getElementById("menu-experiments");
    if (expMenu) expMenu.classList.add("active");
    document.title = "電子実験ノート";
  }
}

function backToExperimentList() {
  showView("experiments");
  filterAndRenderExperiments();
}

function backToProtocolList() {
  showView("protocols");
  loadProtocols();
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
  
  renderTagFilters();
  showView("experiments");
  filterAndRenderExperiments();
}

function viewAllProjects() {
  currentSelectedProjectId = null;
  renderProjectsTree();
  renderTagFilters();
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

  const isAllActive = selectedStatusFilter === null && selectedTag === null;
  const isInProgressActive = selectedStatusFilter === "in_progress";

  let html = `
    <div class="filter-chip ${isAllActive ? "active" : ""}" onclick="clearFilters()">すべて</div>
    <div class="filter-chip ${isInProgressActive ? "active" : ""}" onclick="toggleStatusFilter('in_progress')">進行中</div>
  `;
  tags.forEach((tag) => {
    html += `<div class="filter-chip ${selectedTag === tag ? "active" : ""}" onclick="selectTag('${tag}')">#${tag}</div>`;
  });
  container.innerHTML = html;
}

function clearFilters() {
  selectedStatusFilter = null;
  selectedTag = null;
  renderTagFilters();
  const searchInput = document.getElementById("search-input");
  filterAndRenderExperiments(searchInput ? searchInput.value : "");
}

function toggleStatusFilter(status) {
  if (selectedStatusFilter === status) {
    selectedStatusFilter = null;
  } else {
    selectedStatusFilter = status;
  }
  renderTagFilters();
  const searchInput = document.getElementById("search-input");
  filterAndRenderExperiments(searchInput ? searchInput.value : "");
}

function selectTag(tag) {
  if (selectedTag === tag) {
    selectedTag = null;
  } else {
    selectedTag = tag;
  }
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
    const expStatus = exp.status || "in_progress";
    const matchesStatus = !selectedStatusFilter || expStatus === selectedStatusFilter;
    const matchesTag = !selectedTag || (exp.tags && exp.tags.includes(selectedTag));
    const matchesQuery =
      !q ||
      exp.title.toLowerCase().includes(q) ||
      (exp.tags && exp.tags.some((t) => t.toLowerCase().includes(q))) ||
      (exp.project_id && exp.project_id.toLowerCase().includes(q));
    return matchesProject && matchesStatus && matchesTag && matchesQuery;
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

// ==========================================
// Markdown Image & Attachment URL Resolver
// ==========================================

function resolveExperimentFileUrl(url, projectId, expId) {
  if (!url || typeof url !== "string") return url;
  const trimmed = url.trim();

  // 外部URL、data URI、アンカー、既にAPIパスの場合はそのまま
  if (/^(https?:|\/\/|data:|#|\/api\/)/i.test(trimmed)) {
    return trimmed;
  }

  // 編集中のプロジェクトまたは実験IDが未設定の場合は変換不可
  if (!projectId || !expId) {
    return trimmed;
  }

  // Windowsパス (C:\...) や file:/// スキームを正規化
  let cleanPath = trimmed.replace(/^file:\/\/\/?/i, "");
  cleanPath = cleanPath.replace(/\\/g, "/");

  // クエリやハッシュを除いたファイル名部分を抽出
  const pathWithoutQuery = cleanPath.split("?")[0].split("#")[0];
  const filename = pathWithoutQuery.split("/").pop();
  if (!filename) return trimmed;

  return `/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(expId)}/files/${encodeURIComponent(filename)}`;
}

function initMarkedRenderer() {
  if (typeof marked === "undefined") return;

  const customRenderer = {
    image(tokenOrHref, title, text) {
      let href = "", imgTitle = "", altText = "";
      if (typeof tokenOrHref === "object" && tokenOrHref !== null) {
        href = tokenOrHref.href || "";
        imgTitle = tokenOrHref.title || "";
        altText = tokenOrHref.text || "";
      } else {
        href = tokenOrHref || "";
        imgTitle = title || "";
        altText = text || "";
      }

      const resolvedHref = resolveExperimentFileUrl(href, currentEditingProjectId, currentEditingExpId);
      const titleAttr = imgTitle ? ` title="${escapeHtml(imgTitle)}"` : "";
      const altAttr = altText ? ` alt="${escapeHtml(altText)}"` : "";
      return `<img src="${escapeHtml(resolvedHref)}"${altAttr}${titleAttr} class="preview-embedded-img" loading="lazy">`;
    },
    link(tokenOrHref, title, text) {
      let href = "", linkTitle = "", linkText = "";
      if (typeof tokenOrHref === "object" && tokenOrHref !== null) {
        href = tokenOrHref.href || "";
        linkTitle = tokenOrHref.title || "";
        linkText = tokenOrHref.text || "";
      } else {
        href = tokenOrHref || "";
        linkTitle = title || "";
        linkText = text || "";
      }

      const resolvedHref = resolveExperimentFileUrl(href, currentEditingProjectId, currentEditingExpId);
      const titleAttr = linkTitle ? ` title="${escapeHtml(linkTitle)}"` : "";
      return `<a href="${escapeHtml(resolvedHref)}"${titleAttr} target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    }
  };

  try {
    marked.use({ renderer: customRenderer });
  } catch (e) {
    console.warn("marked.use renderer setup warning", e);
  }
}

function updatePreview() {
  const markdownText = document.getElementById("markdown-input").value;
  const previewContainer = document.getElementById("markdown-preview");
  if (!previewContainer) return;

  if (typeof marked !== "undefined") {
    previewContainer.innerHTML = marked.parse(markdownText);

    // 画像URLのフォールバック補正（HTML直書き <img> や動的パスの完全カバー）
    previewContainer.querySelectorAll("img").forEach((img) => {
      const originalSrc = img.getAttribute("src");
      if (originalSrc) {
        const resolvedSrc = resolveExperimentFileUrl(originalSrc, currentEditingProjectId, currentEditingExpId);
        if (resolvedSrc && resolvedSrc !== originalSrc) {
          img.setAttribute("src", resolvedSrc);
        }
      }
      img.onerror = () => {
        img.onerror = null;
        img.classList.add("img-load-error");
        img.style.display = "inline-block";
        img.style.padding = "6px 10px";
        img.style.background = "#fef2f2";
        img.style.border = "1px dashed #f87171";
        img.style.borderRadius = "4px";
        img.style.color = "#991b1b";
        img.style.fontSize = "0.78rem";
        img.alt = `⚠️ 画像を読み込めませんでした (${originalSrc || "不明"})`;
      };
    });

    // リンク属性と相対ファイルリンクの解決
    previewContainer.querySelectorAll("a").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");

      const originalHref = a.getAttribute("href");
      if (originalHref) {
        const resolvedHref = resolveExperimentFileUrl(originalHref, currentEditingProjectId, currentEditingExpId);
        if (resolvedHref && resolvedHref !== originalHref) {
          a.setAttribute("href", resolvedHref);
        }
      }
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

// ==========================================
// PDF Export with Dynamic Note Title
// ==========================================

function getNotePdfFileName() {
  const titleInput = document.getElementById("input-title");
  const dateInput = document.getElementById("input-date");
  const rawTitle = titleInput ? titleInput.value.trim() : "";
  const rawDate = dateInput ? dateInput.value.trim() : "";

  let baseName = "";
  if (rawDate && rawTitle) {
    if (rawTitle.startsWith(rawDate)) {
      baseName = rawTitle;
    } else {
      baseName = `${rawDate}_${rawTitle}`;
    }
  } else if (rawTitle) {
    baseName = rawTitle;
  } else if (currentEditingExpId) {
    baseName = currentEditingExpId;
  } else {
    baseName = "実験ノート";
  }

  // OSファイル名として使用できない文字 (\ / : * ? " < > |) をサニタイズ
  return baseName.replace(/[\\/*?:"<>|]/g, "_").trim() || "実験ノート";
}

function exportCurrentNoteToPdf() {
  const originalTitle = document.title;
  const fileName = getNotePdfFileName();

  // PDF保存時のデフォルトファイル名として使用されるため一時的に変更
  document.title = fileName;

  let restored = false;
  const restoreTitle = () => {
    if (restored) return;
    restored = true;
    document.title = originalTitle;
    window.removeEventListener("afterprint", restoreTitle);
  };

  window.addEventListener("afterprint", restoreTitle);
  window.print();

  // afterprint が発火しない環境向けの安全策
  setTimeout(restoreTitle, 2500);
}

async function exportNoteToPdf(projectId, expId) {
  if (currentEditingProjectId !== projectId || currentEditingExpId !== expId) {
    await openEditorForExperiment(projectId, expId);
    setTimeout(() => {
      exportCurrentNoteToPdf();
    }, 400);
  } else {
    exportCurrentNoteToPdf();
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

  // エディタ表示中のブラウザタブタイトルを連動
  if (title) {
    document.title = `${title} - 電子実験ノート`;
  } else {
    document.title = "新規実験ノート - 電子実験ノート";
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

function formatMarkdownTableCell(val) {
  if (val === null || val === undefined) return " ";
  let str = String(val).trim();
  // セル内改行を Markdown 表用 <br> に変換
  str = str.replace(/\r?\n/g, "<br>");
  // パイプ文字 | を \| にエスケープ
  str = str.replace(/\|/g, "\\|");
  return str || " ";
}

/**
 * HTML文字列（Excel, Google Sheets, Webページのコピペ）からMarkdown表に変換
 */
function parseHtmlTableToMarkdown(html) {
  if (!html || typeof html !== "string") return null;
  if (!/<table[\s>]/i.test(html)) return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const table = doc.querySelector("table");
    if (!table) return null;

    const trElements = Array.from(table.querySelectorAll("tr"));
    if (trElements.length === 0) return null;

    const rows = [];
    for (const tr of trElements) {
      const cells = [];
      const tdElements = Array.from(tr.querySelectorAll("th, td"));
      if (tdElements.length === 0) continue;

      for (const td of tdElements) {
        // セル内の <br> や段落ブロックを改行コードに変換
        const clonedTd = td.cloneNode(true);
        clonedTd.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
        clonedTd.querySelectorAll("p, div, li").forEach(block => {
          block.insertAdjacentText("afterend", "\n");
        });

        const rawText = clonedTd.textContent || "";
        const formatted = formatMarkdownTableCell(rawText);

        const colspan = parseInt(td.getAttribute("colspan") || "1", 10);
        cells.push(formatted);
        // colspan が 2 以上の場合は空セルで補填して列のズレを防ぐ
        for (let i = 1; i < colspan; i++) {
          cells.push(" ");
        }
      }
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) return null;

    // 最大列数を計算
    const maxCols = Math.max(...rows.map(r => r.length));
    if (maxCols <= 1) return null; // 1セルのみは通常のテキスト貼り付けに任せる

    // すべての行の列数を揃える
    rows.forEach(r => {
      while (r.length < maxCols) {
        r.push(" ");
      }
    });

    const headerRow = `| ${rows[0].join(" | ")} |`;
    const sepRow = `| ${rows[0].map(() => "---").join(" | ")} |`;
    const bodyRows = rows.slice(1).map(row => `| ${row.join(" | ")} |`);

    return [headerRow, sepRow, ...bodyRows].join("\n");
  } catch (e) {
    console.warn("parseHtmlTableToMarkdown error", e);
    return null;
  }
}

/**
 * クォート対応 TSV / CSV パーサー（セル内改行、引用符のエスケープに対応）
 */
function parseDelimitedText(text, delimiter) {
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell);
      if (currentRow.some(c => c.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += char;
    }
  }

  currentRow.push(currentCell);
  if (currentRow.some(c => c.trim().length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * プレーンテキスト（TSV / CSV）からMarkdown表に変換
 */
function parsePlainTableToMarkdown(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const hasTab = trimmed.includes("\t");
  let delimiter = hasTab ? "\t" : ",";

  if (!hasTab) {
    const firstLines = trimmed.split(/\r?\n/).slice(0, 5);
    const commaCounts = firstLines.map(l => (l.match(/,/g) || []).length);
    if (commaCounts.length === 0 || commaCounts[0] === 0 || !commaCounts.every(c => Math.abs(c - commaCounts[0]) <= 1)) {
      return null;
    }
  }

  const rawRows = parseDelimitedText(trimmed, delimiter);
  if (rawRows.length < 1) return null;

  const rows = rawRows.map(row => row.map(cell => formatMarkdownTableCell(cell)));
  const maxCols = Math.max(...rows.map(r => r.length));
  if (maxCols <= 1) return null;

  rows.forEach(r => {
    while (r.length < maxCols) {
      r.push(" ");
    }
  });

  const headerRow = `| ${rows[0].join(" | ")} |`;
  const sepRow = `| ${rows[0].map(() => "---").join(" | ")} |`;
  const bodyRows = rows.slice(1).map(row => `| ${row.join(" | ")} |`);

  return [headerRow, sepRow, ...bodyRows].join("\n");
}

/**
 * クリップボードデータから最適なMarkdown表を生成
 */
function parseClipboardTableToMarkdown(clipboardData) {
  if (!clipboardData) return null;

  // 1. text/html を最優先 (Excel, Google Sheets, Webテーブルの完全構造)
  const html = clipboardData.getData("text/html");
  if (html) {
    const md = parseHtmlTableToMarkdown(html);
    if (md) return md;
  }

  // 2. text/plain をフォールバック利用 (TSV/CSVテキスト)
  const plainText = clipboardData.getData("text/plain");
  if (plainText) {
    const md = parsePlainTableToMarkdown(plainText);
    if (md) return md;
  }

  return null;
}

function insertTextAtCursor(textarea, text, targetPos = null, addBlankLines = true) {
  if (!textarea) return;
  textarea.focus();

  let start = textarea.selectionStart !== undefined ? textarea.selectionStart : textarea.value.length;
  let end = textarea.selectionEnd !== undefined ? textarea.selectionEnd : textarea.value.length;

  if (typeof targetPos === "number" && targetPos >= 0) {
    start = targetPos;
    end = targetPos;
  }

  const val = textarea.value;
  const before = val.substring(0, start);
  const after = val.substring(end);

  let insertion = text;
  if (addBlankLines) {
    const prefix = (start > 0 && !before.endsWith("\n\n")) ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const suffix = (!after.startsWith("\n\n")) ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
    insertion = prefix + text.trim() + suffix;
  }

  // document.execCommand('insertText') を実行してブラウザの Undo 履歴 (Ctrl+Z) に正しく登録
  let success = false;
  try {
    textarea.setSelectionRange(start, end);
    success = document.execCommand("insertText", false, insertion);
  } catch (err) {
    success = false;
  }

  if (!success) {
    // execCommand が失敗した場合のフォールバック
    textarea.value = before + insertion + after;
    const newPos = start + insertion.length;
    textarea.selectionStart = newPos;
    textarea.selectionEnd = newPos;
  }

  // input イベントを発火してプレビュー等を連動
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  updatePreview();
}

function initEditorDragAndPaste(textarea) {
  if (!textarea) return;

  let isShiftPasteActive = false;

  // Shift + Ctrl + V (Mac は Shift + Cmd + V) を検知
  textarea.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    if (isCtrlOrCmd && e.shiftKey && (e.key === "v" || e.key === "V")) {
      isShiftPasteActive = true;
    }
  });

  textarea.addEventListener("keyup", (e) => {
    if (e.key === "Shift" || e.key === "Control" || e.key === "Meta" || e.key === "v" || e.key === "V") {
      setTimeout(() => {
        isShiftPasteActive = false;
      }, 150);
    }
  });

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

    // 外部ファイル（PC等から直接ファイルがドロップされた場合）
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const uploaded = await uploadFileList(e.dataTransfer.files);
      if (uploaded && uploaded.length > 0) {
        for (const att of uploaded) {
          if (att.is_image) {
            insertTextAtCursor(textarea, `![${att.filename}](${att.rel_path})\n`, dropPos, true);
          } else {
            insertTextAtCursor(textarea, `[📎 ${att.filename}](${att.rel_path})\n`, dropPos, true);
          }
        }
      }
      return;
    }

    const attJson = e.dataTransfer.getData("application/lab-note-att");
    if (attJson) {
      try {
        const att = JSON.parse(attJson);
        if (att.is_csv) {
          await insertCsvAsMarkdownTable(att, textarea, dropPos);
        } else if (att.is_image) {
          insertTextAtCursor(textarea, `![${att.filename}](${att.rel_path})`, dropPos, true);
          showToast(`図「${att.filename}」を挿入しました`, "info");
        } else {
          insertTextAtCursor(textarea, `[📎 ${att.filename}](${att.rel_path})`, dropPos, true);
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
      insertTextAtCursor(textarea, text, dropPos, false);
    }
  });

  // ペースト処理（Ctrl+V / Shift+Ctrl+V）
  textarea.addEventListener("paste", (e) => {
    const isShiftPaste = isShiftPasteActive;
    isShiftPasteActive = false; // 直ちにリセット

    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    // 1. Shift + Ctrl + V の場合: 表変換を行わず、プレーンテキストをそのまま挿入 (Ctrl+Z 可能)
    if (isShiftPaste) {
      e.preventDefault();
      const plainText = clipboardData.getData("text/plain");
      if (plainText) {
        insertTextAtCursor(textarea, plainText, null, false);
        showToast("プレーンテキストとして貼り付けました", "info");
      }
      return;
    }

    // 2. 通常の Ctrl + V の場合: 表データ（HTML table または TSV/CSV）なら Markdown 表に自動変換 (Ctrl+Z 可能)
    const mdTable = parseClipboardTableToMarkdown(clipboardData);
    if (mdTable) {
      e.preventDefault();
      insertTextAtCursor(textarea, mdTable, null, true);
      showToast("表データをMarkdown表形式に自動変換して挿入しました (Ctrl+Zで元に戻せます)", "success");
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
    
    const headerRow = `| ${header.map(c => formatMarkdownTableCell(c)).join(" | ")} |`;
    const sepRow = `| ${header.map(() => "---").join(" | ")} |`;
    const dataRows = (data.rows || []).map(row => {
      const r = [...row];
      while (r.length < colCount) r.push("");
      return `| ${r.map(c => formatMarkdownTableCell(c)).join(" | ")} |`;
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

  currentEditingAttachments = attachments || [];

  const validAttachments = currentEditingAttachments.filter(
    (att) => att && att.filename && !att.filename.startsWith(".")
  );

  const countBadge = document.getElementById("attachments-count-badge");
  if (countBadge) {
    countBadge.textContent = validAttachments.length > 0 ? `(${validAttachments.length})` : "";
  }

  if (validAttachments.length === 0) {
    container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.78rem;">なし (ファイルをここにドラッグ＆ドロップして追加)</span>';
    return;
  }

  container.innerHTML = validAttachments
    .map((att) => {
      let icon = "📄";
      let actionBtn = "";
      
      let sourceBadge = "";
      if (att.source === "figures") {
        sourceBadge = `<span style="font-size: 0.65rem; background: #e0f2fe; color: #0369a1; padding: 1px 4px; border-radius: 3px; font-weight: 600; border: 1px solid #bae6fd;">解析図</span>`;
      } else if (att.source === "rawdata") {
        sourceBadge = `<span style="font-size: 0.65rem; background: #fef3c7; color: #b45309; padding: 1px 4px; border-radius: 3px; font-weight: 600; border: 1px solid #fde68a;">生データ</span>`;
      }

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
        ${sourceBadge}
        <a href="${att.rel_path}" download style="color: var(--text-main); text-decoration: none; font-weight: 500; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(att.filename)}">
          ${escapeHtml(att.filename)}
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

async function uploadFileList(files) {
  if (!files || files.length === 0) return [];
  if (!currentEditingProjectId || !currentEditingExpId) {
    showToast("ファイルを添付する前に、一度「保存する」ボタンを押して実験ノートを作成してください", "warning");
    return [];
  }

  let successCount = 0;
  let failCount = 0;
  const lastUploadedAtts = [];

  for (const file of Array.from(files)) {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(currentEditingProjectId)}/experiments/${encodeURIComponent(currentEditingExpId)}/upload`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        successCount++;
        const filename = data.filename || file.name;
        const lower = filename.toLowerCase();
        const isImg = /\.(png|jpe?g|gif|webp|svg)$/.test(lower);
        const isCsv = /\.(csv|tsv)$/.test(lower);
        const rel_path = `/api/projects/${encodeURIComponent(currentEditingProjectId)}/experiments/${encodeURIComponent(currentEditingExpId)}/files/${encodeURIComponent(filename)}`;
        lastUploadedAtts.push({
          filename,
          rel_path,
          is_image: isImg,
          is_csv: isCsv,
        });
      } else {
        failCount++;
      }
    } catch (e) {
      console.error("Upload failed for file", file.name, e);
      failCount++;
    }
  }

  if (successCount > 0) {
    showToast(`${successCount} 件のファイルを添付しました`, "success");
    await openEditorForExperiment(currentEditingProjectId, currentEditingExpId);
  }
  if (failCount > 0) {
    showToast(`${failCount} 件のファイル添付に失敗しました`, "error");
  }

  return lastUploadedAtts;
}

async function uploadFile() {
  const fileInput = document.getElementById("file-upload-input");
  if (!fileInput || !fileInput.files.length) return;
  await uploadFileList(fileInput.files);
  fileInput.value = "";
}

function initAttachmentsBarDragAndDrop() {
  const bar = document.getElementById("attachments-bar");
  if (!bar) return;

  // ブラウザがファイルを画面全体で開いてしまう誤動作を防止
  window.addEventListener("dragover", (e) => {
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
    }
  });
  window.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
      // bar や textarea 以外の意図しないドロップによる画面遷移を阻止
      e.preventDefault();
    }
  });

  bar.addEventListener("dragenter", (e) => {
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      bar.classList.add("drag-over");
    }
  });

  bar.addEventListener("dragover", (e) => {
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      bar.classList.add("drag-over");
    }
  });

  bar.addEventListener("dragleave", (e) => {
    if (!bar.contains(e.relatedTarget)) {
      bar.classList.remove("drag-over");
    }
  });

  bar.addEventListener("drop", async (e) => {
    bar.classList.remove("drag-over");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      await uploadFileList(e.dataTransfer.files);
    }
  });
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
              <a class="btn btn-secondary" style="padding: 3px 7px; font-size: 0.82rem; text-decoration: none;" 
                 href="/protocols/${encodeURIComponent(proto.id)}/preview" target="_blank" onclick="event.stopPropagation()"
                 title="プレビュー">
                👁️
              </a>
              <button class="btn btn-secondary" style="padding: 3px 7px; font-size: 0.82rem;" 
                onclick="event.stopPropagation(); openProtocolEditorForEdit('${proto.id}')"
                title="編集">
                ✏️
              </button>
              <button class="btn btn-secondary" style="padding: 3px 7px; font-size: 0.82rem;" 
                onclick="event.stopPropagation(); startExperimentFromSingleProtocol('${proto.id}')"
                title="実験開始">
                ⚡
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
      action: () => openProtocolEditorForEdit(protoId)
    },
    {
      icon: "📋",
      label: "複製 (登録画面で編集)",
      action: () => openProtocolEditorForDuplicate(protoId)
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
// Protocol Editor Operations (Full-screen view)
// ==========================================

let currentEditingProtoId = null;
let pendingProtoEditorFiles = [];
let currentProtoEditorAttachments = [];
let isProtoEditorMetaCollapsed = false;
let isProtoFullscreenInput = false;
let isProtoFullscreenPreview = false;
let protoIdUserEdited = false;
let protoTitleDebounceTimer = null;

// Summary update for collapsed bar
function updateCollapsedProtoSummary() {
  const idVal = document.getElementById("proto-edit-id-input")?.value.trim() || "";
  const titleVal = document.getElementById("proto-edit-title")?.value.trim() || "";
  const catVal = document.getElementById("proto-edit-category")?.value.trim() || "General";

  const idEl = document.getElementById("collapsed-proto-id");
  if (idEl) idEl.textContent = idVal ? `🏷️ ${idVal}` : "🏷️ (ID未設定)";

  const titleEl = document.getElementById("collapsed-proto-title");
  if (titleEl) titleEl.textContent = titleVal ? `📋 ${titleVal}` : "📋 (タイトル未設定)";

  const catEl = document.getElementById("collapsed-proto-category");
  if (catEl) catEl.textContent = `🗂️ ${catVal}`;

  if (titleVal) {
    document.title = `${titleVal} - プロトコル編集`;
  } else {
    document.title = "プロトコル編集 - 電子実験ノート";
  }
}

// Meta card collapse toggle
function toggleProtoEditorMetaCard(forceState) {
  const card = document.getElementById("proto-header-card");
  const bar = document.getElementById("proto-meta-collapsed-bar");
  if (!card || !bar) return;

  if (typeof forceState === "boolean") {
    isProtoEditorMetaCollapsed = forceState;
  } else {
    isProtoEditorMetaCollapsed = !isProtoEditorMetaCollapsed;
  }

  if (isProtoEditorMetaCollapsed) {
    card.style.display = "none";
    bar.style.display = "flex";
  } else {
    card.style.display = "block";
    bar.style.display = "none";
  }
}

// Live preview
function updateProtoPreview() {
  const markdownText = document.getElementById("proto-markdown-input")?.value || "";
  const previewContainer = document.getElementById("proto-markdown-preview");
  if (!previewContainer) return;

  if (typeof marked !== "undefined") {
    previewContainer.innerHTML = marked.parse(markdownText);
  } else {
    previewContainer.textContent = markdownText;
  }
}

// Fullscreen toggle for proto panes
function toggleFullscreenProtoInput() {
  const panes = document.getElementById("proto-editor-panes");
  const icon = document.getElementById("icon-proto-fs-input");
  if (!panes) return;

  if (isProtoFullscreenInput) {
    panes.classList.remove("fullscreen-input");
    isProtoFullscreenInput = false;
    if (icon) icon.innerHTML = SVG_EXPAND;
  } else {
    panes.classList.remove("fullscreen-preview");
    isProtoFullscreenPreview = false;
    const prevIcon = document.getElementById("icon-proto-fs-preview");
    if (prevIcon) prevIcon.innerHTML = SVG_EXPAND;

    panes.classList.add("fullscreen-input");
    isProtoFullscreenInput = true;
    if (icon) icon.innerHTML = SVG_COMPRESS;
  }
}

function toggleFullscreenProtoPreview() {
  const panes = document.getElementById("proto-editor-panes");
  const icon = document.getElementById("icon-proto-fs-preview");
  if (!panes) return;

  if (isProtoFullscreenPreview) {
    panes.classList.remove("fullscreen-preview");
    isProtoFullscreenPreview = false;
    if (icon) icon.innerHTML = SVG_EXPAND;
  } else {
    panes.classList.remove("fullscreen-input");
    isProtoFullscreenInput = false;
    const inputIcon = document.getElementById("icon-proto-fs-input");
    if (inputIcon) inputIcon.innerHTML = SVG_EXPAND;

    panes.classList.add("fullscreen-preview");
    isProtoFullscreenPreview = true;
    if (icon) icon.innerHTML = SVG_COMPRESS;
  }
}

function resetProtoFullscreen() {
  const panes = document.getElementById("proto-editor-panes");
  if (panes) {
    panes.classList.remove("fullscreen-input", "fullscreen-preview");
  }
  isProtoFullscreenInput = false;
  isProtoFullscreenPreview = false;
  const inIcon = document.getElementById("icon-proto-fs-input");
  const prIcon = document.getElementById("icon-proto-fs-preview");
  if (inIcon) inIcon.innerHTML = SVG_EXPAND;
  if (prIcon) prIcon.innerHTML = SVG_EXPAND;
}

// Protocol Attachments Management
function renderProtoEditorAttachments() {
  const listEl = document.getElementById("proto-editor-attachments-list");
  if (!listEl) return;

  const totalCount = currentProtoEditorAttachments.length + pendingProtoEditorFiles.length;
  if (totalCount === 0) {
    listEl.innerHTML = '<span style="color: var(--text-muted); font-size: 0.78rem;">添付ファイルはありません</span>';
    return;
  }

  let html = "";
  // 既存の添付ファイル
  currentProtoEditorAttachments.forEach((att) => {
    html += `
      <div class="proto-attachment-chip">
        <span>📎</span>
        <a href="${escapeHtml(att.rel_path)}" target="_blank" title="${escapeHtml(att.filename)} (${Math.round(att.size / 1024)} KB)">${escapeHtml(att.filename)}</a>
        <button type="button" class="btn-chip-del" title="削除" onclick="deleteExistingProtoEditorAttachment('${escapeHtml(att.saved_name)}')">&times;</button>
      </div>
    `;
  });

  // 新規作成時の保留ファイル
  pendingProtoEditorFiles.forEach((file, idx) => {
    html += `
      <div class="proto-attachment-chip" style="background: #ecfdf5; border-color: #a7f3d0;">
        <span>📄</span>
        <span style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(file.name)} (${Math.round(file.size / 1024)} KB)">${escapeHtml(file.name)} (保存時にアップロード)</span>
        <button type="button" class="btn-chip-del" title="取り消し" onclick="removePendingProtoEditorFile(${idx})">&times;</button>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

function onProtoEditorFileSelected(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  if (currentEditingProtoId) {
    // 既存プロトコル編集中の場合は即時アップロード
    uploadProtoFilesImmediatelyForEditor(currentEditingProtoId, files);
  } else {
    // 新規作成時は保留リストに追加
    files.forEach((f) => pendingProtoEditorFiles.push(f));
    renderProtoEditorAttachments();
  }
  event.target.value = "";
}

async function uploadProtoFilesImmediatelyForEditor(protoId, files) {
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
  await reloadProtoEditorAttachments(protoId);
  await loadProtocols();
}

async function reloadProtoEditorAttachments(protoId) {
  try {
    const res = await fetch(`/api/protocols/${encodeURIComponent(protoId)}`);
    if (res.ok) {
      const data = await res.json();
      currentProtoEditorAttachments = data.attachments || [];
      pendingProtoEditorFiles = [];
      renderProtoEditorAttachments();
    }
  } catch (e) {
    console.error("reloadProtoEditorAttachments failed", e);
  }
}

function removePendingProtoEditorFile(index) {
  pendingProtoEditorFiles.splice(index, 1);
  renderProtoEditorAttachments();
}

async function deleteExistingProtoEditorAttachment(savedName) {
  if (!currentEditingProtoId) return;

  try {
    const res = await fetch(`/api/protocols/${encodeURIComponent(currentEditingProtoId)}/files/${encodeURIComponent(savedName)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("削除に失敗しました");
    showToast("添付ファイルを削除しました", "info");
    await reloadProtoEditorAttachments(currentEditingProtoId);
    await loadProtocols();
  } catch (e) {
    showToast("添付削除エラー: " + e.message, "error");
  }
}

// ID Auto-generation
async function autoGenerateProtocolIdForEditor(titleHint) {
  const hint = titleHint !== undefined ? titleHint : (document.getElementById("proto-edit-title")?.value || "");
  try {
    const res = await fetch(`/api/protocols/generate-id?name=${encodeURIComponent(hint)}`);
    if (res.ok) {
      const data = await res.json();
      const idInput = document.getElementById("proto-edit-id-input");
      if (idInput && !protoIdUserEdited) {
        idInput.value = data.id;
        updateCollapsedProtoSummary();
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
  const idInput = document.getElementById("proto-edit-id-input");
  if (idInput && !protoIdUserEdited) {
    idInput.value = generated;
    updateCollapsedProtoSummary();
  }
  return generated;
}

function onProtoEditorTitleInput(val) {
  if (currentEditingProtoId) return; // 既存編集時は変更しない
  if (protoIdUserEdited) return; // ユーザーが手動編集した場合は自動更新しない

  clearTimeout(protoTitleDebounceTimer);
  protoTitleDebounceTimer = setTimeout(() => {
    autoGenerateProtocolIdForEditor(val);
  }, 250);
}

async function onAutoGenerateProtoIdClick() {
  if (currentEditingProtoId) return;
  protoIdUserEdited = false;
  const titleVal = document.getElementById("proto-edit-title")?.value || "";
  await autoGenerateProtocolIdForEditor(titleVal);
  showToast("管理IDを自動採番しました", "info");
}

// Protocol Editor Openers
async function openProtocolEditorForNew() {
  currentEditingProtoId = null;
  protoIdUserEdited = false;

  showView("protocol-editor");
  document.getElementById("proto-editor-page-heading").textContent = "新規プロトコル作成";

  const idInput = document.getElementById("proto-edit-id-input");
  if (idInput) {
    idInput.readOnly = false;
    idInput.disabled = false;
    idInput.style.backgroundColor = "";
    idInput.value = "";
    idInput.oninput = () => {
      protoIdUserEdited = true;
      updateCollapsedProtoSummary();
    };
  }
  const autoBtn = document.getElementById("btn-auto-proto-id");
  if (autoBtn) autoBtn.style.display = "inline";

  document.getElementById("proto-original-id").value = "";
  document.getElementById("proto-edit-title").value = "";
  document.getElementById("proto-edit-category").value = "General";
  document.getElementById("proto-edit-version").value = "1.0";
  document.getElementById("proto-edit-desc").value = "";
  document.getElementById("proto-edit-tags").value = "";
  document.getElementById("proto-markdown-input").value = `## 目的・概要\n\n## 試薬・器具\n\n## 手順・プロトコル (チェックリスト形式)\n- [ ] ステップ 1\n- [ ] ステップ 2\n- [ ] ステップ 3\n\n## 注意事項・コツ\n`;

  pendingProtoEditorFiles = [];
  currentProtoEditorAttachments = [];
  renderProtoEditorAttachments();

  toggleProtoEditorMetaCard(false);
  updateProtoPreview();
  updateCollapsedProtoSummary();

  const delBtn = document.getElementById("btn-delete-proto");
  if (delBtn) delBtn.style.display = "none";

  await autoGenerateProtocolIdForEditor("");
}

async function openProtocolEditorForEdit(protoId) {
  try {
    const res = await fetch(`/api/protocols/${encodeURIComponent(protoId)}`);
    if (!res.ok) throw new Error("プロトコルの取得に失敗しました");
    const proto = await res.json();

    currentEditingProtoId = proto.id;
    protoIdUserEdited = false;

    showView("protocol-editor");
    document.getElementById("proto-editor-page-heading").textContent = `プロトコルの編集 (${proto.id})`;

    const idInput = document.getElementById("proto-edit-id-input");
    if (idInput) {
      idInput.value = proto.id;
      idInput.readOnly = true;
      idInput.disabled = true;
      idInput.style.backgroundColor = "var(--bg-muted, #f1f5f9)";
    }
    const autoBtn = document.getElementById("btn-auto-proto-id");
    if (autoBtn) autoBtn.style.display = "none";

    document.getElementById("proto-original-id").value = proto.id;
    document.getElementById("proto-edit-title").value = proto.title || "";
    document.getElementById("proto-edit-category").value = proto.category || "General";
    document.getElementById("proto-edit-version").value = proto.version || "1.0";
    document.getElementById("proto-edit-desc").value = proto.description || "";
    document.getElementById("proto-edit-tags").value = (proto.tags || []).join(", ");
    document.getElementById("proto-markdown-input").value = proto.content || "";

    currentProtoEditorAttachments = proto.attachments || [];
    pendingProtoEditorFiles = [];
    renderProtoEditorAttachments();

    toggleProtoEditorMetaCard(false);
    updateProtoPreview();
    updateCollapsedProtoSummary();

    const delBtn = document.getElementById("btn-delete-proto");
    if (delBtn) delBtn.style.display = "inline-flex";
  } catch (e) {
    showToast("エラー: " + e.message, "error");
    backToProtocolList();
  }
}

async function openProtocolEditorForDuplicate(protoId) {
  try {
    const res = await fetch(`/api/protocols/${encodeURIComponent(protoId)}`);
    if (!res.ok) throw new Error("プロトコルの取得に失敗しました");
    const proto = await res.json();

    currentEditingProtoId = null; // New protocol
    protoIdUserEdited = false;

    showView("protocol-editor");
    document.getElementById("proto-editor-page-heading").textContent = "新規プロトコル作成 (複製)";

    const idInput = document.getElementById("proto-edit-id-input");
    if (idInput) {
      idInput.readOnly = false;
      idInput.disabled = false;
      idInput.style.backgroundColor = "";
      idInput.value = "";
      idInput.oninput = () => {
        protoIdUserEdited = true;
        updateCollapsedProtoSummary();
      };
    }
    const autoBtn = document.getElementById("btn-auto-proto-id");
    if (autoBtn) autoBtn.style.display = "inline";

    const copyTitle = `${proto.title} (コピー)`;
    document.getElementById("proto-original-id").value = "";
    document.getElementById("proto-edit-title").value = copyTitle;
    document.getElementById("proto-edit-category").value = proto.category || "General";
    document.getElementById("proto-edit-version").value = proto.version || "1.0";
    document.getElementById("proto-edit-desc").value = proto.description || "";
    document.getElementById("proto-edit-tags").value = (proto.tags || []).join(", ");
    document.getElementById("proto-markdown-input").value = proto.content || "";

    pendingProtoEditorFiles = [];
    currentProtoEditorAttachments = [];
    renderProtoEditorAttachments();

    toggleProtoEditorMetaCard(false);
    updateProtoPreview();
    updateCollapsedProtoSummary();

    const delBtn = document.getElementById("btn-delete-proto");
    if (delBtn) delBtn.style.display = "none";

    await autoGenerateProtocolIdForEditor(copyTitle);
  } catch (e) {
    showToast("エラー: " + e.message, "error");
  }
}

// Protocol Editor Save & Delete
async function saveProtocolFromEditor() {
  const title = document.getElementById("proto-edit-title")?.value.trim();
  if (!title) {
    showToast("プロトコルタイトルを入力してください", "warning");
    return;
  }

  const idInput = document.getElementById("proto-edit-id-input");
  const customId = idInput ? idInput.value.trim() : "";
  if (!customId && !currentEditingProtoId) {
    showToast("管理IDを入力または自動採番してください", "warning");
    return;
  }

  const category = document.getElementById("proto-edit-category")?.value.trim() || "General";
  const version = document.getElementById("proto-edit-version")?.value.trim() || "1.0";
  const description = document.getElementById("proto-edit-desc")?.value.trim() || "";
  const tags = (document.getElementById("proto-edit-tags")?.value || "")
    .split(",")
    .map(t => t.trim())
    .filter(t => t);
  const content = document.getElementById("proto-markdown-input")?.value || "";

  const payload = {
    title,
    category,
    version,
    description,
    tags,
    content
  };
  if (currentEditingProtoId) {
    payload.id = currentEditingProtoId;
  } else if (customId) {
    payload.id = customId;
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
    if (pendingProtoEditorFiles.length > 0 && savedProto && savedProto.id) {
      for (const file of pendingProtoEditorFiles) {
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
      pendingProtoEditorFiles = [];
    }

    showToast("プロトコルを保存しました", "success");
    await loadProtocols();
    backToProtocolList();
  } catch (e) {
    showToast("保存エラー: " + e.message, "error");
  }
}

async function deleteProtocolFromEditor() {
  if (!currentEditingProtoId) return;

  const titleVal = document.getElementById("proto-edit-title")?.value || currentEditingProtoId;
  if (!confirm(`プロトコル「${titleVal}」(${currentEditingProtoId}) を完全に削除しますか？`)) {
    return;
  }

  try {
    const res = await fetch(`/api/protocols/${encodeURIComponent(currentEditingProtoId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Delete failed");
    showToast("プロトコルを削除しました", "info");
    await loadProtocols();
    backToProtocolList();
  } catch (e) {
    showToast("削除エラー: " + e.message, "error");
  }
}

async function deleteProtocolDirect(protoId) {
  if (!confirm(`プロトコル (${protoId}) を削除しますか？`)) {
    return;
  }
  try {
    const res = await fetch(`/api/protocols/${encodeURIComponent(protoId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Delete failed");
    showToast("プロトコルを削除しました", "info");
    if (currentEditingProtoId === protoId) {
      backToProtocolList();
    }
    await loadProtocols();
  } catch (e) {
    showToast("削除エラー: " + e.message, "error");
  }
}

// Backward compatibility aliases
async function openNewProtocolModal() {
  await openProtocolEditorForNew();
}
async function editProtocol(protoId) {
  await openProtocolEditorForEdit(protoId);
}
async function duplicateProtocol(protoId) {
  await openProtocolEditorForDuplicate(protoId);
}
async function saveProtocolFromModal() {
  await saveProtocolFromEditor();
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

// ==========================================
// Keyboard Shortcuts & Shortcuts Modal
// ==========================================

function openShortcutsModal() {
  const modal = document.getElementById("shortcuts-modal");
  if (modal) modal.style.display = "flex";
}

function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

    // 1. Ctrl + S (または Cmd + S) -> 保存
    if (isCtrlOrCmd && (e.key === "s" || e.key === "S")) {
      e.preventDefault();

      // プロトコルエディタ表示中 -> プロトコル保存
      const protoEditView = document.getElementById("view-protocol-editor");
      if (protoEditView && protoEditView.style.display !== "none") {
        saveProtocolFromEditor();
        return;
      }

      // 実験ノートエディタ表示中 -> 実験ノート保存
      const editView = document.getElementById("view-editor");
      if (editView && editView.style.display !== "none") {
        saveExperiment();
        return;
      }

      showToast("保存対象のエディタが開かれていません", "info");
      return;
    }

    // 2. Ctrl + Z (または Cmd + Z) -> ひとつ戻る
    if (isCtrlOrCmd && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.isContentEditable
      );

      // 入力欄フォーカス時は通常のテキスト取り消し (Undo) を優先
      if (isInputFocused) {
        return;
      }

      // 入力欄外の時は画面の「ひとつ戻る」
      e.preventDefault();

      // モーダルが開いていれば閉じる
      const openModals = ["shortcuts-modal", "csv-modal", "hidden-projects-modal"];
      for (const mId of openModals) {
        const m = document.getElementById(mId);
        if (m && m.style.display === "flex") {
          closeModal(mId);
          return;
        }
      }

      // プロトコルエディタなら一覧へ戻る
      const protoEditView = document.getElementById("view-protocol-editor");
      if (protoEditView && protoEditView.style.display !== "none") {
        backToProtocolList();
        return;
      }

      // 実験ノートエディタなら一覧へ戻る
      const editView = document.getElementById("view-editor");
      if (editView && editView.style.display !== "none") {
        backToExperimentList();
        return;
      }
    }

    // 3. Escape キー -> モーダルを閉じる
    if (e.key === "Escape") {
      const openModals = ["shortcuts-modal", "csv-modal", "hidden-projects-modal"];
      for (const mId of openModals) {
        const m = document.getElementById(mId);
        if (m && m.style.display === "flex") {
          closeModal(mId);
          return;
        }
      }
    }

    // 4. ? または Ctrl + / -> ショートカット一覧メニューを開閉
    if ((e.key === "?" && !isCtrlOrCmd) || (isCtrlOrCmd && e.key === "/")) {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.isContentEditable
      );
      if (isInputFocused && e.key === "?") {
        return;
      }

      e.preventDefault();
      const modal = document.getElementById("shortcuts-modal");
      if (modal) {
        if (modal.style.display === "flex") {
          closeModal("shortcuts-modal");
        } else {
          openShortcutsModal();
        }
      }
    }

    // 5. Ctrl + P (または Cmd + P) -> PDF 印刷・出力
    if (isCtrlOrCmd && (e.key === "p" || e.key === "P")) {
      const editView = document.getElementById("view-editor");
      if (editView && editView.style.display !== "none") {
        e.preventDefault();
        exportCurrentNoteToPdf();
        return;
      }
    }
  });
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


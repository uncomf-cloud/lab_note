"""
Storage module for lab_note.
Handles reading and writing of Markdown files with YAML frontmatter for protocols and project-based experiments.
Data is stored under:
  - laboratory/protocols/*.md
  - laboratory/shared/protocols/{protocol_id}_{filename}  (Protocol reference attachments)
  - laboratory/projects/{project_id}/experiments/{experiment_id}/note.md
"""

import os
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
import frontmatter

from config import PROTOCOLS_DIR, PROJECTS_DIR, SHARED_PROTOCOLS_DIR, LAB_WORKSPACE_PATH, ensure_workspace_dirs

ensure_workspace_dirs()

STATUS_IN_PROGRESS = "in_progress"
STATUS_COMPLETED = "completed"
VALID_STATUSES = [STATUS_IN_PROGRESS, STATUS_COMPLETED]

def _slugify(text: str) -> str:
    """Convert text to safe filename slug."""
    text = re.sub(r'[\\/*?:"<>|]', "", text)
    text = text.strip().replace(" ", "_")
    return text or "untitled"

def _get_status_dir(project_id: str, status: str) -> Path:
    """Get experiments status directory path (in_progress or completed)."""
    sub_dir = STATUS_COMPLETED if status == STATUS_COMPLETED else STATUS_IN_PROGRESS
    target = PROJECTS_DIR / project_id / "experiments" / sub_dir
    target.mkdir(parents=True, exist_ok=True)
    return target

def _ensure_project_exp_dirs(project_id: str) -> None:
    """Ensure in_progress and completed directories exist in project experiments."""
    _get_status_dir(project_id, STATUS_IN_PROGRESS)
    _get_status_dir(project_id, STATUS_COMPLETED)

def _find_experiment_dir(project_id: str, experiment_id: str) -> Optional[Path]:
    """Find experiment directory across in_progress, completed, and legacy root."""
    base_exp = PROJECTS_DIR / project_id / "experiments"
    for sub in [STATUS_IN_PROGRESS, STATUS_COMPLETED]:
        candidate = base_exp / sub / experiment_id
        if candidate.exists() and candidate.is_dir():
            return candidate
    legacy = base_exp / experiment_id
    if legacy.exists() and legacy.is_dir() and legacy.name not in [STATUS_IN_PROGRESS, STATUS_COMPLETED, "predata"]:
        return legacy
    return None

def _exp_sort_key(exp: Dict[str, Any]):
    """Sort key: in_progress first (0) then completed (1), then earlier date first (ascending), then title ascending."""
    status_order = 0 if exp.get("status") == STATUS_IN_PROGRESS else 1
    date_val = exp.get("date") or "9999-99-99"
    title_val = exp.get("title") or exp.get("id") or ""
    return (status_order, date_val, title_val.lower())

def _scan_experiments_in_project(project_id: str) -> List[Dict[str, Any]]:
    """Scan all experiment notes within a project across in_progress, completed, and legacy paths."""
    exp_dir = PROJECTS_DIR / project_id / "experiments"
    if not exp_dir.exists():
        return []

    _ensure_project_exp_dirs(project_id)
    exp_items = []
    seen_ids = set()

    scan_targets = [
        (exp_dir / STATUS_IN_PROGRESS, STATUS_IN_PROGRESS),
        (exp_dir / STATUS_COMPLETED, STATUS_COMPLETED),
    ]

    for parent_dir, default_status in scan_targets:
        if not parent_dir.exists():
            continue
        for e_dir in parent_dir.iterdir():
            if not e_dir.is_dir() or e_dir.name in seen_ids:
                continue
            note_file = e_dir / "note.md"
            if not note_file.exists():
                continue
            try:
                post = frontmatter.load(str(note_file), encoding="utf-8")
                meta = post.metadata or {}
                status = meta.get("status", default_status)
                if status not in VALID_STATUSES:
                    status = STATUS_IN_PROGRESS
                exp_items.append({
                    "id": e_dir.name,
                    "title": meta.get("title", e_dir.name),
                    "date": meta.get("date", ""),
                    "status": status,
                    "tags": meta.get("tags", []),
                    "updated_at": meta.get("updated_at", str(note_file.stat().st_mtime)),
                    "dir_path": str(e_dir)
                })
                seen_ids.add(e_dir.name)
            except Exception as e:
                print(f"[WARN] Error loading {note_file}: {e}")

    # Legacy: direct child folders in experiments/ (excluding predata, in_progress, completed)
    for e_dir in exp_dir.iterdir():
        if not e_dir.is_dir() or e_dir.name in [STATUS_IN_PROGRESS, STATUS_COMPLETED, "predata"] or e_dir.name in seen_ids:
            continue
        note_file = e_dir / "note.md"
        if not note_file.exists():
            continue
        try:
            post = frontmatter.load(str(note_file), encoding="utf-8")
            meta = post.metadata or {}
            status = meta.get("status", STATUS_IN_PROGRESS)
            if status not in VALID_STATUSES:
                status = STATUS_IN_PROGRESS
            exp_items.append({
                "id": e_dir.name,
                "title": meta.get("title", e_dir.name),
                "date": meta.get("date", ""),
                "status": status,
                "tags": meta.get("tags", []),
                "updated_at": meta.get("updated_at", str(note_file.stat().st_mtime)),
                "dir_path": str(e_dir)
            })
            seen_ids.add(e_dir.name)
        except Exception as e:
            print(f"[WARN] Error loading legacy {note_file}: {e}")

    exp_items.sort(key=_exp_sort_key)
    return exp_items

def migrate_experiments_to_status_dirs() -> Dict[str, int]:
    """Migrate legacy experiments stored directly under experiments/ to in_progress/ or completed/."""
    ensure_workspace_dirs()
    count = 0
    if not PROJECTS_DIR.exists():
        return {"migrated": 0}

    for p_dir in PROJECTS_DIR.iterdir():
        if not p_dir.is_dir() or p_dir.name.startswith(".") or p_dir.name == "template":
            continue
        exp_dir = p_dir / "experiments"
        if not exp_dir.exists():
            continue
        
        _ensure_project_exp_dirs(p_dir.name)
        
        for e_dir in list(exp_dir.iterdir()):
            if not e_dir.is_dir() or e_dir.name in [STATUS_IN_PROGRESS, STATUS_COMPLETED, "predata"]:
                continue
            note_file = e_dir / "note.md"
            if not note_file.exists():
                continue
            try:
                post = frontmatter.load(str(note_file), encoding="utf-8")
                meta = post.metadata or {}
                status = meta.get("status", STATUS_IN_PROGRESS)
                if status not in VALID_STATUSES:
                    status = STATUS_IN_PROGRESS
                    meta["status"] = STATUS_IN_PROGRESS
                    post.metadata = meta
                    note_file.write_text(frontmatter.dumps(post), encoding="utf-8")
                
                target_parent = exp_dir / (STATUS_COMPLETED if status == STATUS_COMPLETED else STATUS_IN_PROGRESS)
                target_dest = target_parent / e_dir.name
                if not target_dest.exists():
                    shutil.move(str(e_dir), str(target_dest))
                    count += 1
            except Exception as e:
                print(f"Error migrating {e_dir}: {e}")

    return {"migrated": count}

# ==========================================
# Project Operations
# ==========================================

def list_projects() -> List[Dict[str, Any]]:
    """List all research project folders under laboratory/projects/ excluding template."""
    ensure_workspace_dirs()
    projects = []
    
    if not PROJECTS_DIR.exists():
        return projects

    for p_dir in PROJECTS_DIR.iterdir():
        if not p_dir.is_dir() or p_dir.name.startswith(".") or p_dir.name == "template":
            continue
        
        description = ""
        readme_path = p_dir / "README.md"
        context_path = p_dir / "CONTEXT.md"
        
        target_doc = readme_path if readme_path.exists() else (context_path if context_path.exists() else None)
        if target_doc:
            try:
                content = target_doc.read_text(encoding="utf-8", errors="replace")
                lines = [l.strip() for l in content.splitlines() if l.strip() and not l.startswith("#")]
                if lines:
                    description = lines[0][:100]
            except Exception:
                pass
        
        exp_items = _scan_experiments_in_project(p_dir.name)

        projects.append({
            "id": p_dir.name,
            "title": p_dir.name,
            "description": description,
            "experiment_count": len(exp_items),
            "experiments": exp_items,
            "dir_path": str(p_dir)
        })

    projects.sort(key=lambda x: x["id"])
    return projects

def get_project_dir(project_id: str) -> Optional[Path]:
    """Get project directory path."""
    p_dir = PROJECTS_DIR / project_id
    if p_dir.exists() and p_dir.is_dir():
        return p_dir
    return None

# ==========================================
# Protocol Operations (laboratory/shared/protocols)
# ==========================================

def generate_protocol_id(name_hint: str = "") -> str:
    """Generate standardized protocol ID: <No.>-<name>-yymmdd.
    Example: 01-PCR-260916, 02-ELISA-260916
    """
    ensure_workspace_dirs()
    yymmdd = datetime.now().strftime("%y%m%d")
    
    # Extract clean name slug (letters, digits, hyphen)
    clean_name = re.sub(r'[^a-zA-Z0-9_-]', '', name_hint.replace(" ", "_")).strip("_-")
    if not clean_name:
        clean_name = "Protocol"

    # Count existing protocols to determine next 2-digit number
    existing_protocols = list_protocols()
    existing_nums = []
    for p in existing_protocols:
        m = re.match(r"^(\d+)-", p["id"])
        if m:
            try:
                existing_nums.append(int(m.group(1)))
            except ValueError:
                pass
                
    next_no = max(existing_nums, default=len(existing_protocols)) + 1
    base_id = f"{next_no:02d}-{clean_name}-{yymmdd}"
    
    candidate = base_id
    counter = 1
    while (SHARED_PROTOCOLS_DIR / f"{candidate}.md").exists():
        candidate = f"{base_id}_{counter}"
        counter += 1
        
    return candidate

def migrate_protocols_to_shared() -> Dict[str, int]:
    """Migrate any legacy protocol files from laboratory/protocols to laboratory/shared/protocols."""
    legacy_dir = LAB_WORKSPACE_PATH / "protocols"
    if not legacy_dir.exists() or legacy_dir.resolve() == SHARED_PROTOCOLS_DIR.resolve():
        return {"migrated": 0}
    
    count = 0
    for f in list(legacy_dir.glob("*.md")):
        dest = SHARED_PROTOCOLS_DIR / f.name
        if not dest.exists():
            shutil.move(str(f), str(dest))
            count += 1
    return {"migrated": count}

def list_protocols() -> List[Dict[str, Any]]:
    """List all available protocols stored under laboratory/shared/protocols."""
    ensure_workspace_dirs()
    protocols = []
    
    # Ensure any legacy files are unified into shared/protocols
    migrate_protocols_to_shared()
    
    if not SHARED_PROTOCOLS_DIR.exists():
        return protocols

    for file_path in SHARED_PROTOCOLS_DIR.glob("*.md"):
        try:
            post = frontmatter.load(str(file_path), encoding="utf-8")
            meta = post.metadata or {}
            protocol_id = file_path.stem

            # Count attachments in shared/protocols: {protocol_id}-ref* or {protocol_id}_*
            prefix_ref = f"{protocol_id}-ref"
            prefix_legacy = f"{protocol_id}_"
            attachment_count = len([
                f for f in SHARED_PROTOCOLS_DIR.iterdir()
                if f.is_file() and f.name != file_path.name and (f.name.startswith(prefix_ref) or f.name.startswith(prefix_legacy))
            ])

            protocols.append({
                "id": protocol_id,
                "title": meta.get("title", protocol_id),
                "category": meta.get("category", "General"),
                "version": meta.get("version", "1.0"),
                "updated_at": meta.get("updated_at", str(file_path.stat().st_mtime)),
                "author": meta.get("author", ""),
                "tags": meta.get("tags", []),
                "description": meta.get("description", ""),
                "attachment_count": attachment_count,
                "file_path": str(file_path)
            })
        except Exception as e:
            protocols.append({
                "id": file_path.stem,
                "title": file_path.stem,
                "error": str(e)
            })
            
    protocols.sort(key=lambda x: x.get("id", "").lower())
    return protocols

def get_protocol(protocol_id: str) -> Optional[Dict[str, Any]]:
    """Get single protocol details, content and shared reference attachments."""
    ensure_workspace_dirs()
    file_path = SHARED_PROTOCOLS_DIR / f"{protocol_id}.md"
    if not file_path.exists():
        return None
    
    post = frontmatter.load(str(file_path), encoding="utf-8")
    meta = post.metadata or {}

    # Find attachments in shared/protocols: {protocol_id}-ref* or legacy {protocol_id}_*
    attachments = []
    prefix_ref = f"{protocol_id}-ref"
    prefix_legacy = f"{protocol_id}_"
    
    if SHARED_PROTOCOLS_DIR.exists():
        for f in SHARED_PROTOCOLS_DIR.iterdir():
            if f.is_file() and f.name != file_path.name and (f.name.startswith(prefix_ref) or f.name.startswith(prefix_legacy)):
                orig_name = f.name
                if f.name.startswith(prefix_ref):
                    orig_name = f.name
                elif f.name.startswith(prefix_legacy):
                    orig_name = f.name[len(prefix_legacy):]
                    
                attachments.append({
                    "saved_name": f.name,
                    "filename": orig_name,
                    "size": f.stat().st_size,
                    "is_pdf": f.suffix.lower() == ".pdf",
                    "is_image": f.suffix.lower() in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
                    "rel_path": f"/api/protocols/{protocol_id}/files/{f.name}"
                })

    attachments.sort(key=lambda x: x["saved_name"])

    return {
        "id": protocol_id,
        "title": meta.get("title", protocol_id),
        "category": meta.get("category", "General"),
        "version": meta.get("version", "1.0"),
        "created_at": meta.get("created_at", ""),
        "updated_at": meta.get("updated_at", ""),
        "author": meta.get("author", ""),
        "tags": meta.get("tags", []),
        "description": meta.get("description", ""),
        "content": post.content,
        "attachments": attachments,
        "file_path": str(file_path)
    }

def save_protocol(
    protocol_id: str,
    title: str,
    content: str,
    category: str = "General",
    version: str = "1.0",
    author: str = "",
    tags: Optional[List[str]] = None,
    description: str = ""
) -> Dict[str, Any]:
    """Create or update a protocol in laboratory/shared/protocols."""
    ensure_workspace_dirs()
    if not protocol_id:
        protocol_id = generate_protocol_id(title)
    else:
        protocol_id = _slugify(protocol_id)
        
    file_path = SHARED_PROTOCOLS_DIR / f"{protocol_id}.md"
    
    existing = get_protocol(protocol_id)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    created_at = existing.get("created_at", now_str) if existing else now_str

    metadata = {
        "id": protocol_id,
        "title": title,
        "category": category,
        "version": version,
        "created_at": created_at,
        "updated_at": now_str,
        "author": author,
        "tags": tags or [],
        "description": description
    }
    
    post = frontmatter.Post(content, **metadata)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(frontmatter.dumps(post))
        
    return get_protocol(protocol_id)

def delete_protocol(protocol_id: str) -> bool:
    """Delete a protocol file and its associated reference attachments in shared/protocols."""
    ensure_workspace_dirs()
    file_path = SHARED_PROTOCOLS_DIR / f"{protocol_id}.md"
    deleted = False
    if file_path.exists():
        file_path.unlink()
        deleted = True

    # Clean up attachments: {protocol_id}-ref* and {protocol_id}_*
    prefix_ref = f"{protocol_id}-ref"
    prefix_legacy = f"{protocol_id}_"
    if SHARED_PROTOCOLS_DIR.exists():
        for f in SHARED_PROTOCOLS_DIR.iterdir():
            if f.is_file() and (f.name.startswith(prefix_ref) or f.name.startswith(prefix_legacy)):
                try:
                    f.unlink()
                except Exception:
                    pass

    return deleted

def save_protocol_attachment(protocol_id: str, filename: str, data: bytes) -> str:
    """Save reference attachment to laboratory/shared/protocols with naming <no.>-<name>-yymmdd-ref<no.>.<ext>."""
    ensure_workspace_dirs()
    ext = Path(filename).suffix.lower()
    
    # Calculate next reference number: <protocol_id>-ref{idx}
    prefix_ref = f"{protocol_id}-ref"
    existing_nums = []
    if SHARED_PROTOCOLS_DIR.exists():
        for f in SHARED_PROTOCOLS_DIR.iterdir():
            if f.is_file() and f.stem.startswith(prefix_ref):
                num_str = f.stem[len(prefix_ref):]
                try:
                    existing_nums.append(int(num_str))
                except ValueError:
                    pass
                    
    next_idx = max(existing_nums, default=0) + 1
    saved_filename = f"{protocol_id}-ref{next_idx:02d}{ext}"
    dest_path = SHARED_PROTOCOLS_DIR / saved_filename
    with open(dest_path, "wb") as f:
        f.write(data)
    return saved_filename

def delete_protocol_attachment(protocol_id: str, filename: str) -> bool:
    """Delete reference attachment from laboratory/shared/protocols."""
    ensure_workspace_dirs()
    target_path = SHARED_PROTOCOLS_DIR / filename
    if target_path.exists() and target_path.is_file():
        target_path.unlink()
        return True
    return False

# ==========================================
# Project-based Experiment Operations
# ==========================================

def list_experiments(
    project_id: Optional[str] = None,
    search: Optional[str] = None,
    tag: Optional[str] = None,
    status: Optional[str] = None
) -> List[Dict[str, Any]]:
    """List experiment notes across all or specific projects with ascending sort."""
    ensure_workspace_dirs()
    experiments = []
    
    if project_id:
        p_dir = PROJECTS_DIR / project_id
        target_project_ids = [project_id] if (p_dir.exists() and p_dir.is_dir() and p_dir.name != "template") else []
    else:
        target_project_ids = [
            p.name for p in PROJECTS_DIR.iterdir()
            if p.is_dir() and not p.name.startswith(".") and p.name != "template"
        ]

    for p_id in target_project_ids:
        raw_items = _scan_experiments_in_project(p_id)
        for item in raw_items:
            # Full note details for searching content if needed
            exp_dir = Path(item["dir_path"])
            note_path = exp_dir / "note.md"
            
            attachments = [f.name for f in exp_dir.iterdir() if f.is_file() and f.name != "note.md"]
            item["project_id"] = p_id
            item["attachment_count"] = len(attachments)
            
            if tag and tag not in item.get("tags", []):
                continue
            if status and item.get("status") != status:
                continue
            if search:
                search_lower = search.lower()
                content_text = ""
                try:
                    if note_path.exists():
                        post = frontmatter.load(str(note_path), encoding="utf-8")
                        content_text = post.content.lower()
                except Exception:
                    pass
                matches = (
                    search_lower in item.get("title", "").lower() or
                    search_lower in content_text or
                    any(search_lower in t.lower() for t in item.get("tags", []))
                )
                if not matches:
                    continue
            
            experiments.append(item)

    experiments.sort(key=_exp_sort_key)
    return experiments

def get_experiment(project_id: str, experiment_id: str) -> Optional[Dict[str, Any]]:
    """Get complete details, content and attachments of an experiment in a project."""
    exp_dir = _find_experiment_dir(project_id, experiment_id)
    if not exp_dir or not exp_dir.exists():
        return None
    note_path = exp_dir / "note.md"
    if not note_path.exists():
        return None
    
    post = frontmatter.load(str(note_path), encoding="utf-8")
    meta = post.metadata or {}
    status = meta.get("status", STATUS_IN_PROGRESS)
    if status not in VALID_STATUSES:
        status = STATUS_IN_PROGRESS
    
    attachments = []
    for f in exp_dir.iterdir():
        if f.is_file() and f.name != "note.md":
            attachments.append({
                "filename": f.name,
                "size": f.stat().st_size,
                "is_image": f.suffix.lower() in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
                "is_csv": f.suffix.lower() in [".csv", ".tsv"],
                "is_pdf": f.suffix.lower() == ".pdf",
                "rel_path": f"/api/projects/{project_id}/experiments/{experiment_id}/files/{f.name}"
            })
            
    return {
        "id": experiment_id,
        "project_id": project_id,
        "title": meta.get("title", experiment_id),
        "date": meta.get("date", ""),
        "status": status,
        "protocol_id": meta.get("protocol_id", ""),
        "author": meta.get("author", ""),
        "tags": meta.get("tags", []),
        "summary": meta.get("summary", ""),
        "created_at": meta.get("created_at", ""),
        "updated_at": meta.get("updated_at", ""),
        "content": post.content,
        "attachments": attachments,
        "dir_path": str(exp_dir)
    }

def create_experiment(
    project_id: str,
    title: str,
    date_str: Optional[str] = None,
    protocol_id: Optional[str] = None,
    author: str = "",
    tags: Optional[List[str]] = None,
    summary: str = "",
    initial_content: Optional[str] = None,
    status: str = STATUS_IN_PROGRESS
) -> Dict[str, Any]:
    """Create a new experiment note under laboratory/projects/{project_id}/experiments/{status}/."""
    ensure_workspace_dirs()
    if status not in VALID_STATUSES:
        status = STATUS_IN_PROGRESS
        
    target_parent_dir = _get_status_dir(project_id, status)
    
    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")
        
    title_slug = _slugify(title)[:30]
    base_id = f"{date_str}_{title_slug}"
    
    exp_id = base_id
    counter = 1
    while _find_experiment_dir(project_id, exp_id) is not None:
        exp_id = f"{base_id}_{counter}"
        counter += 1
        
    exp_dir = target_parent_dir / exp_id
    exp_dir.mkdir(parents=True, exist_ok=True)
    
    content = initial_content
    if not content:
        if protocol_id:
            # Handle comma-separated protocol IDs or single ID
            pids = [p.strip() for p in protocol_id.split(",") if p.strip()] if isinstance(protocol_id, str) else list(protocol_id)
            protocol_links = []
            for pid in pids:
                proto = get_protocol(pid)
                p_title = proto.get("title", pid) if proto else pid
                protocol_links.append(f"- [プロトコル] [{p_title} ({pid})](/protocols/{pid}/preview)")
            
            if protocol_links:
                proto_list_str = "\n".join(protocol_links)
                content = f"""## 目的

## 実験手順・方法
{proto_list_str}

## 結果
- 

## 考察
"""
        if not content:
            content = """## 目的

## 実験手順・方法
- [ ] ステップ1
- [ ] ステップ2

## 結果
- 

## 考察
"""

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    metadata = {
        "id": exp_id,
        "project_id": project_id,
        "title": title,
        "date": date_str,
        "status": status,
        "protocol_id": protocol_id or "",
        "author": author,
        "tags": tags or [],
        "summary": summary,
        "created_at": now_str,
        "updated_at": now_str
    }
    
    note_path = exp_dir / "note.md"
    post = frontmatter.Post(content, **metadata)
    with open(note_path, "w", encoding="utf-8") as f:
        f.write(frontmatter.dumps(post))
        
    return get_experiment(project_id, exp_id)

def duplicate_experiment(project_id: str, experiment_id: str) -> Optional[Dict[str, Any]]:
    """Duplicate an existing experiment note and its attachments into in_progress/."""
    original = get_experiment(project_id, experiment_id)
    if not original:
        return None
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    new_title = f"{original['title']} (コピー)"
    
    new_exp = create_experiment(
        project_id=project_id,
        title=new_title,
        date_str=today_str,
        protocol_id=original.get("protocol_id"),
        author=original.get("author", ""),
        tags=original.get("tags", []),
        summary=original.get("summary", ""),
        initial_content=original.get("content", ""),
        status=STATUS_IN_PROGRESS
    )
    
    orig_dir = _find_experiment_dir(project_id, experiment_id)
    new_dir = _find_experiment_dir(project_id, new_exp["id"])
    if orig_dir and new_dir:
        for f in orig_dir.iterdir():
            if f.is_file() and f.name != "note.md":
                shutil.copy2(f, new_dir / f.name)
            
    return get_experiment(project_id, new_exp["id"])

def update_experiment(
    project_id: str,
    experiment_id: str,
    title: str,
    content: str,
    status: str = STATUS_IN_PROGRESS,
    date_str: str = "",
    author: str = "",
    tags: Optional[List[str]] = None,
    summary: str = "",
    protocol_id: str = ""
) -> Optional[Dict[str, Any]]:
    """Update an existing experiment note and automatically move directory if status changes."""
    exp_dir = _find_experiment_dir(project_id, experiment_id)
    if not exp_dir or not exp_dir.exists():
        return None
    note_path = exp_dir / "note.md"
    if not note_path.exists():
        return None
        
    existing = frontmatter.load(str(note_path), encoding="utf-8")
    meta = existing.metadata or {}
    
    if status not in VALID_STATUSES:
        status = STATUS_IN_PROGRESS
        
    # Check if directory move is required (e.g. in_progress -> completed, or from legacy root)
    target_parent_dir = _get_status_dir(project_id, status)
    if exp_dir.parent.resolve() != target_parent_dir.resolve():
        target_exp_dir = target_parent_dir / experiment_id
        if not target_exp_dir.exists():
            shutil.move(str(exp_dir), str(target_exp_dir))
            exp_dir = target_exp_dir
            note_path = exp_dir / "note.md"

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    metadata = {
        "id": experiment_id,
        "project_id": project_id,
        "title": title,
        "date": date_str or meta.get("date", datetime.now().strftime("%Y-%m-%d")),
        "status": status,
        "protocol_id": protocol_id or meta.get("protocol_id", ""),
        "author": author or meta.get("author", ""),
        "tags": tags if tags is not None else meta.get("tags", []),
        "summary": summary,
        "created_at": meta.get("created_at", now_str),
        "updated_at": now_str
    }
    
    post = frontmatter.Post(content, **metadata)
    with open(note_path, "w", encoding="utf-8") as f:
        f.write(frontmatter.dumps(post))
        
    return get_experiment(project_id, experiment_id)

def delete_experiment(project_id: str, experiment_id: str) -> bool:
    """Delete an experiment folder and its attachments."""
    exp_dir = _find_experiment_dir(project_id, experiment_id)
    if exp_dir and exp_dir.exists() and exp_dir.is_dir():
        shutil.rmtree(exp_dir)
        return True
    return False

def save_attachment(project_id: str, experiment_id: str, filename: str, data: bytes) -> str:
    """Save an uploaded file to the experiment directory."""
    exp_dir = _find_experiment_dir(project_id, experiment_id)
    if not exp_dir or not exp_dir.exists():
        exp_dir = _get_status_dir(project_id, STATUS_IN_PROGRESS) / experiment_id
        exp_dir.mkdir(parents=True, exist_ok=True)
        
    safe_name = _slugify(Path(filename).stem) + Path(filename).suffix
    dest_path = exp_dir / safe_name
    with open(dest_path, "wb") as f:
        f.write(data)
    return safe_name

def delete_attachment(project_id: str, experiment_id: str, filename: str) -> bool:
    """Delete an attachment from the experiment directory."""
    exp_dir = _find_experiment_dir(project_id, experiment_id)
    if not exp_dir or not exp_dir.exists():
        return False
    target_path = exp_dir / filename
    if target_path.exists() and target_path.is_file() and filename != "note.md":
        target_path.unlink()
        return True
    return False

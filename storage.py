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

from config import PROTOCOLS_DIR, PROJECTS_DIR, SHARED_PROTOCOLS_DIR, ensure_workspace_dirs

ensure_workspace_dirs()

def _slugify(text: str) -> str:
    """Convert text to safe filename slug."""
    text = re.sub(r'[\\/*?:"<>|]', "", text)
    text = text.strip().replace(" ", "_")
    return text or "untitled"

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
        
        exp_dir = p_dir / "experiments"
        exp_dir.mkdir(parents=True, exist_ok=True)
        
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
        
        exp_items = []
        for e_dir in exp_dir.iterdir():
            if not e_dir.is_dir():
                continue
            note_file = e_dir / "note.md"
            if not note_file.exists():
                continue
            try:
                post = frontmatter.load(str(note_file))
                meta = post.metadata or {}
                exp_items.append({
                    "id": e_dir.name,
                    "title": meta.get("title", e_dir.name),
                    "date": meta.get("date", ""),
                    "status": meta.get("status", "in_progress"),
                    "tags": meta.get("tags", []),
                    "updated_at": meta.get("updated_at", str(note_file.stat().st_mtime))
                })
            except Exception:
                pass

        exp_items.sort(key=lambda x: (x.get("date", ""), x.get("updated_at", "")), reverse=True)

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
# Protocol Operations
# ==========================================

def list_protocols() -> List[Dict[str, Any]]:
    """List all available protocols."""
    ensure_workspace_dirs()
    protocols = []
    for file_path in PROTOCOLS_DIR.glob("*.md"):
        try:
            post = frontmatter.load(str(file_path))
            meta = post.metadata or {}
            protocol_id = file_path.stem

            # Count attachments in shared/protocols
            prefix = f"{protocol_id}_"
            attachment_count = len([
                f for f in SHARED_PROTOCOLS_DIR.iterdir()
                if f.is_file() and f.name.startswith(prefix)
            ]) if SHARED_PROTOCOLS_DIR.exists() else 0

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
    protocols.sort(key=lambda x: x.get("title", "").lower())
    return protocols

def get_protocol(protocol_id: str) -> Optional[Dict[str, Any]]:
    """Get single protocol details, content and shared reference attachments."""
    ensure_workspace_dirs()
    file_path = PROTOCOLS_DIR / f"{protocol_id}.md"
    if not file_path.exists():
        return None
    
    post = frontmatter.load(str(file_path))
    meta = post.metadata or {}

    # Find attachments in shared/protocols named {protocol_id}_{filename}
    attachments = []
    prefix = f"{protocol_id}_"
    if SHARED_PROTOCOLS_DIR.exists():
        for f in SHARED_PROTOCOLS_DIR.iterdir():
            if f.is_file() and f.name.startswith(prefix):
                orig_name = f.name[len(prefix):]
                attachments.append({
                    "saved_name": f.name,
                    "filename": orig_name,
                    "size": f.stat().st_size,
                    "is_pdf": f.suffix.lower() == ".pdf",
                    "is_image": f.suffix.lower() in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
                    "rel_path": f"/api/protocols/{protocol_id}/files/{f.name}"
                })

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
    """Create or update a protocol."""
    ensure_workspace_dirs()
    protocol_id = _slugify(protocol_id)
    file_path = PROTOCOLS_DIR / f"{protocol_id}.md"
    
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
    file_path = PROTOCOLS_DIR / f"{protocol_id}.md"
    deleted = False
    if file_path.exists():
        file_path.unlink()
        deleted = True

    # Also clean up attachments in shared/protocols
    prefix = f"{protocol_id}_"
    if SHARED_PROTOCOLS_DIR.exists():
        for f in SHARED_PROTOCOLS_DIR.iterdir():
            if f.is_file() and f.name.startswith(prefix):
                try:
                    f.unlink()
                except Exception:
                    pass

    return deleted

def save_protocol_attachment(protocol_id: str, filename: str, data: bytes) -> str:
    """Save reference attachment to laboratory/shared/protocols with renamed format {protocol_id}_{filename}."""
    ensure_workspace_dirs()
    safe_orig_name = _slugify(Path(filename).stem) + Path(filename).suffix
    saved_filename = f"{protocol_id}_{safe_orig_name}"
    dest_path = SHARED_PROTOCOLS_DIR / saved_filename
    with open(dest_path, "wb") as f:
        f.write(data)
    return saved_filename

def delete_protocol_attachment(protocol_id: str, filename: str) -> bool:
    """Delete reference attachment from laboratory/shared/protocols."""
    ensure_workspace_dirs()
    target_path = SHARED_PROTOCOLS_DIR / filename
    if target_path.exists() and target_path.is_file() and filename.startswith(f"{protocol_id}_"):
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
    """List experiment notes, excluding template project."""
    ensure_workspace_dirs()
    experiments = []
    
    if project_id:
        p_dir = PROJECTS_DIR / project_id
        target_projects = [p_dir] if (p_dir.exists() and p_dir.is_dir() and p_dir.name != "template") else []
    else:
        target_projects = [
            p for p in PROJECTS_DIR.iterdir()
            if p.is_dir() and not p.name.startswith(".") and p.name != "template"
        ]

    for p_dir in target_projects:
        current_p_id = p_dir.name
        exp_dir = p_dir / "experiments"
        if not exp_dir.exists():
            continue
            
        for e_dir in exp_dir.iterdir():
            if not e_dir.is_dir():
                continue
            note_path = e_dir / "note.md"
            if not note_path.exists():
                continue
            
            try:
                post = frontmatter.load(str(note_path))
                meta = post.metadata or {}
                exp_id = e_dir.name
                
                attachments = [f.name for f in e_dir.iterdir() if f.is_file() and f.name != "note.md"]
                
                exp_item = {
                    "id": exp_id,
                    "project_id": current_p_id,
                    "title": meta.get("title", exp_id),
                    "date": meta.get("date", ""),
                    "status": meta.get("status", "in_progress"),
                    "protocol_id": meta.get("protocol_id", ""),
                    "author": meta.get("author", ""),
                    "tags": meta.get("tags", []),
                    "summary": meta.get("summary", ""),
                    "attachment_count": len(attachments),
                    "updated_at": meta.get("updated_at", str(note_path.stat().st_mtime)),
                    "dir_path": str(e_dir)
                }
                
                if tag and tag not in exp_item["tags"]:
                    continue
                if status and exp_item["status"] != status:
                    continue
                if search:
                    search_lower = search.lower()
                    matches = (
                        search_lower in exp_item["title"].lower() or
                        search_lower in post.content.lower() or
                        any(search_lower in t.lower() for t in exp_item["tags"])
                    )
                    if not matches:
                        continue
                
                experiments.append(exp_item)
            except Exception as e:
                experiments.append({
                    "id": e_dir.name,
                    "project_id": current_p_id,
                    "title": e_dir.name,
                    "error": str(e)
                })

    experiments.sort(key=lambda x: (x.get("date", ""), x.get("updated_at", "")), reverse=True)
    return experiments

def get_experiment(project_id: str, experiment_id: str) -> Optional[Dict[str, Any]]:
    """Get complete details, content and attachments of an experiment in a project."""
    exp_dir = PROJECTS_DIR / project_id / "experiments" / experiment_id
    note_path = exp_dir / "note.md"
    if not note_path.exists():
        return None
    
    post = frontmatter.load(str(note_path))
    meta = post.metadata or {}
    
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
        "status": meta.get("status", "in_progress"),
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
    initial_content: Optional[str] = None
) -> Dict[str, Any]:
    """Create a new experiment note under laboratory/projects/{project_id}/experiments/."""
    ensure_workspace_dirs()
    proj_exp_dir = PROJECTS_DIR / project_id / "experiments"
    proj_exp_dir.mkdir(parents=True, exist_ok=True)
    
    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")
        
    title_slug = _slugify(title)[:30]
    base_id = f"{date_str}_{title_slug}"
    
    exp_id = base_id
    counter = 1
    while (proj_exp_dir / exp_id).exists():
        exp_id = f"{base_id}_{counter}"
        counter += 1
        
    exp_dir = proj_exp_dir / exp_id
    exp_dir.mkdir(parents=True, exist_ok=True)
    
    content = initial_content
    if not content:
        protocol_section = ""
        if protocol_id:
            proto = get_protocol(protocol_id)
            if proto:
                protocol_section = f"\n### 採用プロトコル: [{proto['title']}](protocol://{protocol_id})\n\n"
                protocol_section += proto.get("content", "") + "\n"
        
        content = f"""## 目的


## 実験手順・方法
{protocol_section if protocol_section else '- [ ] 手順1\n- [ ] 手順2\n- [ ] 手順3'}

## 結果
- 測定結果、観察事項などを記入

## 考察 & 次のアクション
- 
"""

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    metadata = {
        "id": exp_id,
        "project_id": project_id,
        "title": title,
        "date": date_str,
        "status": "in_progress",
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
    """Duplicate an existing experiment note and its attachments."""
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
        initial_content=original.get("content", "")
    )
    
    orig_dir = PROJECTS_DIR / project_id / "experiments" / experiment_id
    new_dir = PROJECTS_DIR / project_id / "experiments" / new_exp["id"]
    for f in orig_dir.iterdir():
        if f.is_file() and f.name != "note.md":
            shutil.copy2(f, new_dir / f.name)
            
    return get_experiment(project_id, new_exp["id"])

def update_experiment(
    project_id: str,
    experiment_id: str,
    title: str,
    content: str,
    status: str = "in_progress",
    date_str: str = "",
    author: str = "",
    tags: Optional[List[str]] = None,
    summary: str = "",
    protocol_id: str = ""
) -> Optional[Dict[str, Any]]:
    """Update an existing experiment note."""
    exp_dir = PROJECTS_DIR / project_id / "experiments" / experiment_id
    note_path = exp_dir / "note.md"
    if not note_path.exists():
        return None
        
    existing = frontmatter.load(str(note_path))
    meta = existing.metadata or {}
    
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
    exp_dir = PROJECTS_DIR / project_id / "experiments" / experiment_id
    if exp_dir.exists() and exp_dir.is_dir():
        shutil.rmtree(exp_dir)
        return True
    return False

def save_attachment(project_id: str, experiment_id: str, filename: str, data: bytes) -> str:
    """Save an uploaded file to the experiment directory."""
    exp_dir = PROJECTS_DIR / project_id / "experiments" / experiment_id
    exp_dir.mkdir(parents=True, exist_ok=True)
    safe_name = _slugify(Path(filename).stem) + Path(filename).suffix
    dest_path = exp_dir / safe_name
    with open(dest_path, "wb") as f:
        f.write(data)
    return safe_name

def delete_attachment(project_id: str, experiment_id: str, filename: str) -> bool:
    """Delete an attachment from the experiment directory."""
    target_path = PROJECTS_DIR / project_id / "experiments" / experiment_id / filename
    if target_path.exists() and target_path.is_file() and filename != "note.md":
        target_path.unlink()
        return True
    return False

"""
lab_note - Electronic Lab Notebook Web Application (FastAPI)
Provides RESTful APIs for managing lab protocols and project-based experiments.
"""

import os
import re
import csv
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import config
import storage

app = FastAPI(title="lab_note", description="Electronic Lab Notebook for laboratory projects", version="1.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ==========================================
# Pydantic Request Models
# ==========================================

class ProtocolCreateRequest(BaseModel):
    id: Optional[str] = None
    title: str
    content: str
    category: str = "General"
    version: str = "1.0"
    author: str = ""
    tags: List[str] = []
    description: str = ""

class ExperimentCreateRequest(BaseModel):
    project_id: str
    title: str
    date: Optional[str] = None
    protocol_id: Optional[str] = None
    author: str = ""
    tags: List[str] = []
    summary: str = ""
    content: Optional[str] = None
    status: str = "in_progress"

class ExperimentUpdateRequest(BaseModel):
    title: str
    content: str
    status: str = "in_progress"
    date: str = ""
    author: str = ""
    tags: List[str] = []
    summary: str = ""
    protocol_id: str = ""

# ==========================================
# Static Page Routes (SPA)
# ==========================================

@app.get("/")
async def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return JSONResponse({"message": "static/index.html not found."})

@app.get("/editor")
async def serve_editor():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return JSONResponse({"message": "index.html not found."})

# ==========================================
# System & Project APIs
# ==========================================

@app.get("/api/status")
async def get_status():
    info = config.get_workspace_info()
    projects = storage.list_projects()
    protocols = storage.list_protocols()
    total_experiments = sum(p["experiment_count"] for p in projects)
    
    all_tags = set()
    all_experiments = storage.list_experiments()
    for exp in all_experiments:
        for t in exp.get("tags", []):
            all_tags.add(t)
            
    info.update({
        "project_count": len(projects),
        "protocol_count": len(protocols),
        "experiment_count": total_experiments,
        "tags": sorted(list(all_tags))
    })
    return info

@app.get("/api/projects")
async def get_projects():
    return storage.list_projects()

# ==========================================
# Protocol APIs
# ==========================================

@app.get("/api/protocols")
async def get_protocols():
    return storage.list_protocols()

@app.get("/api/protocols/generate-id")
async def get_generated_protocol_id(name: str = ""):
    return {"id": storage.generate_protocol_id(name)}

@app.get("/api/protocols/{protocol_id}")
async def get_single_protocol(protocol_id: str):
    proto = storage.get_protocol(protocol_id)
    if not proto:
        raise HTTPException(status_code=404, detail="Protocol not found")
    return proto

@app.post("/api/protocols")
async def create_or_update_protocol(req: ProtocolCreateRequest):
    proto_id = req.id
    if not proto_id:
        proto_id = storage.generate_protocol_id(req.title)

    result = storage.save_protocol(
        protocol_id=proto_id,
        title=req.title,
        content=req.content,
        category=req.category,
        version=req.version,
        author=req.author,
        tags=req.tags,
        description=req.description
    )
    return result

@app.delete("/api/protocols/{protocol_id}")
async def delete_protocol(protocol_id: str):
    success = storage.delete_protocol(protocol_id)
    if not success:
        raise HTTPException(status_code=404, detail="Protocol not found")
    return {"message": "Protocol deleted successfully"}

@app.post("/api/protocols/{protocol_id}/upload")
async def upload_protocol_attachment(protocol_id: str, file: UploadFile = File(...)):
    proto = storage.get_protocol(protocol_id)
    if not proto:
        raise HTTPException(status_code=404, detail="Protocol not found")
    contents = await file.read()
    saved_name = storage.save_protocol_attachment(protocol_id, file.filename, contents)
    return {"message": "File uploaded", "filename": saved_name}

@app.get("/api/protocols/{protocol_id}/files/{filename}")
async def get_protocol_attachment_file(protocol_id: str, filename: str):
    target_path = config.SHARED_PROTOCOLS_DIR / filename
    if not target_path.exists() or not filename.startswith(f"{protocol_id}_"):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(target_path))

@app.delete("/api/protocols/{protocol_id}/files/{filename}")
async def delete_protocol_attachment_file(protocol_id: str, filename: str):
    success = storage.delete_protocol_attachment(protocol_id, filename)
    if not success:
        raise HTTPException(status_code=404, detail="File not found")
    return {"message": "File deleted"}

# ==========================================
# Experiment APIs
# ==========================================

@app.get("/api/experiments")
async def get_experiments(
    project_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    return storage.list_experiments(project_id=project_id, search=search, tag=tag, status=status)

@app.get("/api/projects/{project_id}/experiments/{experiment_id}")
async def get_project_experiment(project_id: str, experiment_id: str):
    exp = storage.get_experiment(project_id, experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment note not found")
    return exp

@app.post("/api/experiments")
async def create_experiment(req: ExperimentCreateRequest):
    if not req.project_id:
        raise HTTPException(status_code=400, detail="project_id is required")
    result = storage.create_experiment(
        project_id=req.project_id,
        title=req.title,
        date_str=req.date,
        protocol_id=req.protocol_id,
        author=req.author,
        tags=req.tags,
        summary=req.summary,
        initial_content=req.content,
        status=req.status
    )
    return result

@app.post("/api/projects/{project_id}/experiments/{experiment_id}/duplicate")
async def duplicate_project_experiment(project_id: str, experiment_id: str):
    result = storage.duplicate_experiment(project_id, experiment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Experiment not found to duplicate")
    return result

@app.put("/api/projects/{project_id}/experiments/{experiment_id}")
async def update_project_experiment(project_id: str, experiment_id: str, req: ExperimentUpdateRequest):
    result = storage.update_experiment(
        project_id=project_id,
        experiment_id=experiment_id,
        title=req.title,
        content=req.content,
        status=req.status,
        date_str=req.date,
        author=req.author,
        tags=req.tags,
        summary=req.summary,
        protocol_id=req.protocol_id
    )
    if not result:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return result

@app.delete("/api/projects/{project_id}/experiments/{experiment_id}")
async def delete_project_experiment(project_id: str, experiment_id: str):
    success = storage.delete_experiment(project_id, experiment_id)
    if not success:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return {"message": "Experiment deleted successfully"}

# ==========================================
# Attachment & File APIs
# ==========================================

@app.post("/api/projects/{project_id}/experiments/{experiment_id}/upload")
async def upload_attachment(project_id: str, experiment_id: str, file: UploadFile = File(...)):
    contents = await file.read()
    saved_name = storage.save_attachment(project_id, experiment_id, file.filename, contents)
    return {"message": "File uploaded", "filename": saved_name}

@app.get("/api/projects/{project_id}/experiments/{experiment_id}/files/{filename}")
async def get_attachment_file(project_id: str, experiment_id: str, filename: str):
    exp_dir = storage._find_experiment_dir(project_id, experiment_id)
    if not exp_dir or not exp_dir.exists():
        raise HTTPException(status_code=404, detail="Experiment not found")
    target_path = exp_dir / filename
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(target_path))

@app.delete("/api/projects/{project_id}/experiments/{experiment_id}/files/{filename}")
async def delete_attachment_file(project_id: str, experiment_id: str, filename: str):
    success = storage.delete_attachment(project_id, experiment_id, filename)
    if not success:
        raise HTTPException(status_code=404, detail="File not found or protected")
    return {"message": "File deleted"}

@app.get("/api/projects/{project_id}/experiments/{experiment_id}/preview-csv/{filename}")
async def preview_csv(project_id: str, experiment_id: str, filename: str, limit: int = 100):
    exp_dir = storage._find_experiment_dir(project_id, experiment_id)
    if not exp_dir or not exp_dir.exists():
        raise HTTPException(status_code=404, detail="Experiment not found")
    target_path = exp_dir / filename
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        rows = []
        with open(target_path, "r", encoding="utf-8", errors="replace") as f:
            sample = f.read(4096)
            f.seek(0)
            delimiter = "\t" if "\t" in sample and sample.count("\t") > sample.count(",") else ","
            reader = csv.reader(f, delimiter=delimiter)
            for i, row in enumerate(reader):
                if i >= limit:
                    break
                rows.append([cell.strip() for cell in row])
        return {"headers": rows[0] if rows else [], "rows": rows[1:] if len(rows) > 1 else [], "delimiter": delimiter}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse CSV/TSV: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=config.HOST, port=config.PORT, reload=True)

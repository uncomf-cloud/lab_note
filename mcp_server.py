"""
MCP Server for lab_note (電子実験ノート連携 MCP サーバー)
Enables Google Antigravity / AI agents (protocol-designer, data-analyst, report-writer, etc.) to:
1. Manage experimental protocols in laboratory/shared/protocols/ (list, get, create, update, delete)
2. Manage project-based experiment notes in laboratory/projects/<theme>/experiments/
3. Query projects and search experimental records
"""

import os
import sys
import json
from typing import List, Optional, Dict, Any

# Ensure lab_note directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import config
import storage
from mcp.server.mcpserver import MCPServer

# Initialize MCP server
mcp = MCPServer("lab-note")


# ======================================================================
# 1. Protocol Management Tools (shared/protocols/)
# ======================================================================

@mcp.tool()
def list_protocols() -> str:
    """List all registered experimental protocols in laboratory/shared/protocols/.
    
    Returns:
        JSON string containing the list of protocols with metadata (id, title, category, version, tags, description, updated_at).
    """
    try:
        protocols = storage.list_protocols()
        return json.dumps({
            "status": "success",
            "count": len(protocols),
            "protocols": protocols
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False, indent=2)


@mcp.tool()
def get_protocol(protocol_id: str) -> str:
    """Retrieve full details and Markdown step-by-step checklist of a specific protocol.
    
    Args:
        protocol_id: The unique slug identifier of the protocol (e.g. 'standard_pcr', 'standard_elisa_assay').
    """
    try:
        protocol = storage.get_protocol(protocol_id)
        if not protocol:
            return json.dumps({
                "status": "error",
                "message": f"Protocol '{protocol_id}' not found."
            }, ensure_ascii=False, indent=2)
        return json.dumps({
            "status": "success",
            "protocol": protocol
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False, indent=2)


@mcp.tool()
def save_protocol(
    protocol_id: str,
    title: str,
    content: str,
    category: str = "General",
    version: str = "1.0",
    author: str = "",
    tags: Optional[List[str]] = None,
    description: str = ""
) -> str:
    """Create or update an experimental protocol in laboratory/shared/protocols/<protocol_id>.md.
    Automatically parses/generates YAML Frontmatter and makes the protocol instantly visible in the lab_note UI.
    
    Args:
        protocol_id: Unique slug ID using lowercase letters and underscores (e.g. 'sdf4_cross_ip_wb', 'standard_pcr').
        title: Human-readable official title of the protocol (e.g. 'SDF4抗原同定および交差性検証IP-WBプロトコル').
        content: Step-by-step checklist Markdown content using '- [ ]' for each procedure.
        category: Protocol category (e.g. '分子生物学', '免疫測定', '生化学', '細胞培養', 'タンパク質精製').
        version: Version string (default '1.0').
        author: Author or agent name (e.g. 'protocol-designer').
        tags: List of searchable keyword tags (e.g. ['ELISA', 'SDF4', 'IP-WB', '抗体']).
        description: One-line concise summary of the protocol purpose and targets.
    """
    try:
        saved = storage.save_protocol(
            protocol_id=protocol_id,
            title=title,
            content=content,
            category=category,
            version=version,
            author=author,
            tags=tags or [],
            description=description
        )
        return json.dumps({
            "status": "success",
            "message": f"Protocol '{protocol_id}' saved successfully to laboratory/shared/protocols/{protocol_id}.md.",
            "protocol": saved
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False, indent=2)


@mcp.tool()
def delete_protocol(protocol_id: str) -> str:
    """Delete an experimental protocol from laboratory/shared/protocols/.
    
    Args:
        protocol_id: The unique slug identifier of the protocol to delete.
    """
    try:
        success = storage.delete_protocol(protocol_id)
        if not success:
            return json.dumps({
                "status": "error",
                "message": f"Protocol '{protocol_id}' not found or could not be deleted."
            }, ensure_ascii=False, indent=2)
        return json.dumps({
            "status": "success",
            "message": f"Protocol '{protocol_id}' deleted successfully."
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False, indent=2)


# ======================================================================
# 2. Project & Experiment Operations (laboratory/projects/)
# ======================================================================

@mcp.tool()
def list_projects() -> str:
    """List all available research projects in the laboratory workspace.
    
    Returns:
        JSON string containing the list of projects (id, name, path, experiment_count, last_modified).
    """
    try:
        projects = storage.list_projects()
        return json.dumps({
            "status": "success",
            "count": len(projects),
            "projects": projects
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False, indent=2)


@mcp.tool()
def list_experiments(
    project_id: str = "",
    search: str = "",
    tag: str = "",
    status: str = ""
) -> str:
    """List experiment notes across all projects or within a specific project.
    
    Args:
        project_id: Optional project identifier (e.g. '01_tNP_assay', 'B02_SDF4'). If empty, searches all projects.
        search: Optional search term matching note titles or summaries.
        tag: Optional tag filter.
        status: Optional status filter ('in_progress', 'completed').
    """
    try:
        p_id = project_id if project_id else None
        s_term = search if search else None
        t_filter = tag if tag else None
        st_filter = status if status else None
        
        experiments = storage.list_experiments(
            project_id=p_id,
            search=s_term,
            tag=t_filter,
            status=st_filter
        )
        return json.dumps({
            "status": "success",
            "count": len(experiments),
            "experiments": experiments
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False, indent=2)


@mcp.tool()
def get_experiment(project_id: str, experiment_id: str) -> str:
    """Retrieve full details of an experiment note (note.md content, metadata, and attachments).
    
    Args:
        project_id: Project identifier (e.g. 'B02_SDF4', '01_tNP_assay').
        experiment_id: Experiment directory name (e.g. '2026-09-16_tNP結合アッセイ初期条件検討').
    """
    try:
        exp = storage.get_experiment(project_id, experiment_id)
        if not exp:
            return json.dumps({
                "status": "error",
                "message": f"Experiment '{experiment_id}' not found in project '{project_id}'."
            }, ensure_ascii=False, indent=2)
        return json.dumps({
            "status": "success",
            "experiment": exp
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False, indent=2)


@mcp.tool()
def create_experiment(
    project_id: str,
    title: str,
    protocol_id: str = "",
    author: str = "",
    tags: Optional[List[str]] = None,
    summary: str = "",
    content: str = ""
) -> str:
    """Create a new experiment note under laboratory/projects/<project_id>/experiments/<YYYY-MM-DD_title>/.
    If protocol_id is provided, the protocol checklist is automatically embedded into the note content.
    
    Args:
        project_id: Project identifier (e.g. 'B02_SDF4', '01_tNP_assay').
        title: Title of the experiment.
        protocol_id: Optional registered protocol ID (e.g. 'standard_pcr') to embed its procedure.
        author: Experimenter or agent name.
        tags: List of searchable keyword tags.
        summary: Brief summary of the experiment objective.
        content: Optional custom Markdown body. If omitted and protocol_id is given, protocol content is used.
    """
    try:
        proto_id = protocol_id if protocol_id else None
        init_content = content if content else None
        
        result = storage.create_experiment(
            project_id=project_id,
            title=title,
            protocol_id=proto_id,
            author=author,
            tags=tags or [],
            summary=summary,
            initial_content=init_content
        )
        return json.dumps({
            "status": "success",
            "message": f"Experiment note created successfully in project '{project_id}'.",
            "experiment": result
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False, indent=2)


@mcp.tool()
def update_experiment(
    project_id: str,
    experiment_id: str,
    title: str,
    content: str,
    status: str = "in_progress",
    author: str = "",
    tags: Optional[List[str]] = None,
    summary: str = "",
    protocol_id: str = ""
) -> str:
    """Update an existing experiment note (metadata and Markdown content).
    
    Args:
        project_id: Project identifier (e.g. 'B02_SDF4', '01_tNP_assay').
        experiment_id: Experiment directory name.
        title: Updated title.
        content: Updated Markdown body (observations, results, discussion).
        status: Progress status ('in_progress', 'completed').
        author: Experimenter or agent name.
        tags: List of tags.
        summary: Updated summary.
        protocol_id: Associated protocol ID.
    """
    try:
        updated = storage.update_experiment(
            project_id=project_id,
            experiment_id=experiment_id,
            title=title,
            content=content,
            status=status,
            author=author,
            tags=tags or [],
            summary=summary,
            protocol_id=protocol_id
        )
        if not updated:
            return json.dumps({
                "status": "error",
                "message": f"Failed to update experiment '{experiment_id}' in project '{project_id}'."
            }, ensure_ascii=False, indent=2)
        return json.dumps({
            "status": "success",
            "message": f"Experiment '{experiment_id}' updated successfully.",
            "experiment": updated
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False, indent=2)


# ======================================================================
# Main Entry Point
# ======================================================================

if __name__ == "__main__":
    mcp.run()

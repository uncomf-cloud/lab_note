"""
lab_note Application Launcher
Automatically opens the default browser and runs the FastAPI server.
"""

import sys
import time
import webbrowser
import threading
import uvicorn

import config

def open_browser(url: str, delay: float = 1.2):
    """Wait for server to start, then open the browser."""
    time.sleep(delay)
    print(f"Opening browser at: {url}")
    webbrowser.open(url)

def main():
    url = f"http://{config.HOST}:{config.PORT}"
    print("=" * 50)
    print(f"  Starting lab_note on: {url}")
    print(f"  Laboratory Data Path: {config.LAB_WORKSPACE_PATH}")
    print("=" * 50)

    # Launch browser thread
    threading.Thread(target=open_browser, args=(url,), daemon=True).start()

    # Start FastAPI server
    uvicorn.run("main:app", host=config.HOST, port=config.PORT, reload=False)

if __name__ == "__main__":
    main()

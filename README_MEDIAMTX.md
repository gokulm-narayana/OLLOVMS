# WebRTC Live Streaming with MediaMTX

This document explains the real-time, zero-latency WebRTC video integration added to the NuraEye VMS project.

## 1. The Problem
Standard web browsers (Chrome, Safari, Edge) **do not support the RTSP protocol** natively in the `<video>` tag. Historically, viewing an IP camera feed in a browser required heavy transcoding (HLS) which adds 3-10 seconds of delay, or MJPEG (Snapshot proxying) which results in a very low framerate (1-2 FPS).

## 2. Prerequisites & Installation Requirements

The native WebRTC implementation is extremely lightweight and requires no external front-end libraries.

### A. System Requirements (The MediaMTX Binary)
You must download the standalone **MediaMTX executable** for the machine running the UI backend (e.g., Jetson or Mac). It acts as the routing middleman between the UI and the ONVIF cameras.
- **On Mac (Apple Silicon):** Select the `darwin_arm64` release.
- **On NVIDIA Jetson (Production):** Select the `linux_arm64v8` release.
*Extract the `mediamtx` binary and `mediamtx.yml` into your `nuraeyevms` root folder.*

### B. Python Backend Requirements
Your Python environment needs the `requests` library to tell MediaMTX when a new camera is connecting. Ensure standard dependencies are in your `.venv` or `requirements.txt`:
```bash
pip install requests flask flask-cors onvif-zeep opencv-python
```

### C. Frontend JavaScript Requirements
**None!** Zero external plugins, libraries, or massive video player scripts are imported.
The VMS dashboard relies entirely on the native browser `RTCPeerConnection` and HTML5 `<video>` elements to render the WebRTC feed.

---

## 3. The Architecture: WebRTC + MediaMTX
To achieve sub-second, zero-latency streaming (like a true NVR), we now use **WebRTC**. 

Because cameras speak RTSP and browsers speak WebRTC, we use **MediaMTX** as a lightweight, single-executable "middleman" proxy server.

### Architecture Flow
1. **The Camera (Device):** Sends standard RTSP video (`rtsp://user:pass@IP/stream`).
2. **MediaMTX (Middleman):** Pulls the RTSP feed and instantly repackages it into WebRTC packets.
3. **The Browser (Frontend):** Uses the JavaScript `RTCPeerConnection` API to connect directly to MediaMTX and play the video natively in an HTML5 `<video>` element with hardware acceleration.

---

## 3. How the Code Works

### A. Python Backend (`api_server.py`)
When a user connects a camera via `/api/cameras/connect`, the server successfully authenticates with the ONVIF profile and retrieves the `stream_url`.

Immediately after, `api_server.py` sends an API request to MediaMTX to dynamically register this camera:
```python
# Registers the camera stream dynamically with MediaMTX
requests.post("http://localhost:9997/v3/config/paths/add/cam_192_168_0_100", json={
    "source": stream_url
})
```

### B. Angular Frontend (`cameras-controller.js` & `multiview-controller.js`)
When navigating to the Live View or the Multiview grid, the UI generates a direct WebRTC connection natively using the **WHEP** (WebRTC HTTP Egress Protocol) signaling standard.

```javascript
// Simplified WHEP Negotiation
var pc = new RTCPeerConnection();
pc.addTransceiver('video', { direction: 'recvonly' });

// Get local offer
pc.createOffer().then(offer => pc.setLocalDescription(offer))
.then(() => {
    // Send offer to MediaMTX
    return fetch('http://localhost:8889/cam_192_168_0_100/whep', {
        method: 'POST',
        body: pc.localDescription.sdp,
        headers: { 'Content-Type': 'application/sdp' }
    });
})
.then(response => response.text())
// Accept remote answer
.then(answer => pc.setRemoteDescription({ type: 'answer', sdp: answer }));
```

---

## 4. Running the System

To use the live viewing capabilities, MediaMTX must be running alongside your Python backend.

1. **Start MediaMTX:**
   Open a terminal in the project directory and run:
   ```bash
   ./mediamtx
   ```
2. **Start the API Server:**
   In a separate terminal, run:
   ```bash
   source .venv/bin/activate
   python python/api_server.py
   ```

*(Note: `mediamtx.yml` has been modified to set `api: true` so the Python server can register cameras on the fly).*

---

## 5. Fallback Mechanism (Snapshots)
If a camera rejects the ONVIF stream authentication (e.g., mismatched time sync preventing RTSP URL retrieval), the backend will return an empty `stream_url` but may still provide a `snapshot_url`.

The frontend is programmed strictly to handle this scenario:
- If WebRTC is available: It renders the `<video id="liveVideoPlayer">` tag.
- If WebRTC is broken but snapshots are available: It falls back to the `<img ng-src="...">` MJPEG proxy, pulling a frame every 0.5 seconds to ensure you still have a visual feed, even if delayed.

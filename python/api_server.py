import sys
import os
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import cv2

# Add parent directory to path so we can import pythonperson modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from pythonperson.ws_discovery_scanner import discover_onvif_cameras

app = Flask(__name__)
CORS(app)

@app.route('/api/cameras/scan', methods=['GET'])
def scan_cameras():
    print("API hit: /api/cameras/scan")
    try:
        # Takes ~3.0 seconds network wait time
        cameras = discover_onvif_cameras(timeout=3.0)
        return jsonify({"status": "success", "data": cameras})
    except Exception as e:
        print(f"Error scanning cameras: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/cameras/connect', methods=['POST'])
def connect_camera():
    data = request.json
    ip = data.get('ip')
    port = data.get('port', 80)
    username = data.get('username')
    password = data.get('password')
    
    if not all([ip, username, password]):
        return jsonify({"status": "error", "message": "Missing credentials or IP"}), 400

    try:
        from onvif import ONVIFCamera # type: ignore
        # Keep timeout short so UI doesn't hang forever
        mycam = ONVIFCamera(ip, port, username, password)
        
        # Getting device information to verify connection
        device_service = mycam.create_devicemgmt_service()
        device_info = device_service.GetDeviceInformation()
        
        # Try to get Media service for profiles (RTSP stream URL & Snapshot)
        stream_url = ""
        snapshot_url = ""
        try:
            media_service = mycam.create_media_service()
            profiles = media_service.GetProfiles()
            if profiles:
                token = profiles[0].token
                
                stream_setup = {'Stream': 'RTP-Unicast', 'Transport': {'Protocol': 'RTSP'}}
                try:
                    res = media_service.GetStreamUri({'StreamSetup': stream_setup, 'ProfileToken': token})
                    stream_url = res.Uri
                    # Bake username and password into stream URL for OpenCV
                    if "://" in stream_url:
                        parts = stream_url.split("://")
                        import urllib.parse
                        up_user = urllib.parse.quote(username)
                        up_pass = urllib.parse.quote(password)
                        stream_url = f"{parts[0]}://{up_user}:{up_pass}@{parts[1]}"
                except Exception as ev:
                    print("StreamUri Err:", ev)
                    
                try:
                    snap_res = media_service.GetSnapshotUri({'ProfileToken': token})
                    snapshot_url = snap_res.Uri
                except Exception as ev2:
                    print("SnapshotUri Err:", ev2)
                    
        except Exception as e:
            print(f"ONVIF Media profile could not be retrieved for {ip}: {e}")

        webrtc_path = ""
        if stream_url:
            webrtc_path = f"cam_{ip.replace('.', '_')}"
            try:
                import requests
                # Register the RTSP stream with MediaMTX
                payload = {"source": stream_url}
                # Attempt to add; if it exists, it might return 400ish, which is fine
                requests.post(f"http://localhost:9997/v3/config/paths/add/{webrtc_path}", json=payload, timeout=2)
            except Exception as e:
                print(f"MediaMTX registration failed for {ip}: {e}")

        return jsonify({
            "status": "success",
            "camera": {
                "ip": ip,
                "manufacturer": getattr(device_info, 'Manufacturer', 'Unknown'),
                "model": getattr(device_info, 'Model', 'Unknown'),
                "firmware": getattr(device_info, 'FirmwareVersion', 'Unknown'),
                "stream_url": stream_url,
                "webrtc_path": webrtc_path,
                "snapshot_url": snapshot_url,
                "auth_user": username,
                "auth_pass": password
            }
        })
    except Exception as e:
        print(f"ONVIF Authentication failed for {ip}: {e}")
        return jsonify({"status": "error", "message": f"Authentication failed: {str(e)}"}), 401

def generate_frames(url):
    # Set buffer sizes small to minimize latency (optional but good for IP cameras)
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay"
    cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    
    while True:
        success, frame = cap.read()
        if not success:
            break
            
        # Compress to JPEG
        ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 60])
        if not ret:
            continue
            
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
               
    cap.release()

@app.route('/api/cameras/stream')
def stream_camera():
    url = request.args.get('url')
    if not url:
        return "Missing URL", 400
    
    return Response(generate_frames(url), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/cameras/snapshot_stream')
def snapshot_stream():
    url = request.args.get('url')
    user = request.args.get('user')
    pwd = request.args.get('pass')
    
    if not url:
        return "Missing URL", 400

    def generate_snapshots():
        import time
        import requests
        from requests.auth import HTTPDigestAuth
        
        while True:
            try:
                r = requests.get(url, auth=HTTPDigestAuth(user, pwd), timeout=2)
                if r.status_code == 401:
                    r = requests.get(url, auth=(user, pwd), timeout=2)
                    
                if r.status_code == 200:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + r.content + b'\r\n')
            except Exception as e:
                print("Snapshot pull error:", e)
            time.sleep(0.5)

    return Response(generate_snapshots(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == "__main__":
    print("Starting NuraEye VMS Backend API Server on port 5000...")
    # use_reloader=False prevents Flask from re-spawning with the system Python
    # instead of the .venv interpreter, which causes 'No module named onvif' errors
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)

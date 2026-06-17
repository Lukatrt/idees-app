import urllib.request, json, ssl, time

ctx = ssl._create_unverified_context()
headers = {
    "X-API-Key": "ptr_YyQt2GCd1ERBJgvPURF/cayXxl1GStMC9lkFlqMQr58=",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0"
}

try:
    # 1. Create container
    url_create = "https://portainer.ekonum.fr/api/endpoints/2/docker/containers/create?name=temp-ip-check"
    body_create = {
        "Image": "idees-pwa-idees-app:latest",
        "Cmd": ["sh", "-c", "ip -6 addr"],
        "HostConfig": {
            "NetworkMode": "host"
        }
    }
    req = urllib.request.Request(url_create, headers=headers, data=json.dumps(body_create).encode(), method="POST")
    with urllib.request.urlopen(req, context=ctx) as r:
        res = json.loads(r.read().decode())
        container_id = res["Id"]
        print(f"Container created with ID: {container_id[:12]}")

    # 2. Start container
    url_start = f"https://portainer.ekonum.fr/api/endpoints/2/docker/containers/{container_id}/start"
    req = urllib.request.Request(url_start, headers=headers, method="POST")
    with urllib.request.urlopen(req, context=ctx) as r:
        r.read()
        print("Container started")

    # 3. Wait for execution
    time.sleep(3)

    # 4. Get logs
    url_logs = f"https://portainer.ekonum.fr/api/endpoints/2/docker/containers/{container_id}/logs?stdout=true&stderr=true"
    req_logs = urllib.request.Request(url_logs, headers={
        "X-API-Key": "ptr_YyQt2GCd1ERBJgvPURF/cayXxl1GStMC9lkFlqMQr58=",
        "User-Agent": "Mozilla/5.0"
    }, method="GET")
    with urllib.request.urlopen(req_logs, context=ctx) as r:
        logs = r.read().decode(errors="ignore")
        print("\n=== NETWORK CONFIGURATION (IPv6) ===")
        # Clean up binary headers from Docker logs stream if present
        for line in logs.splitlines():
            # Docker logs contain stream headers (8 bytes at start of lines)
            if len(line) > 8 and (line.startswith("\x01") or line.startswith("\x02")):
                print(line[8:])
            else:
                print(line)
        print("====================================\n")

finally:
    # 5. Delete container (cleanup)
    try:
        url_delete = f"https://portainer.ekonum.fr/api/endpoints/2/docker/containers/temp-ip-check?v=true&force=true"
        req_del = urllib.request.Request(url_delete, headers={
            "X-API-Key": "ptr_YyQt2GCd1ERBJgvPURF/cayXxl1GStMC9lkFlqMQr58=",
            "User-Agent": "Mozilla/5.0"
        }, method="DELETE")
        with urllib.request.urlopen(req_del, context=ctx) as r:
            r.read()
            print("Container temp-ip-check cleaned up successfully.")
    except Exception as e:
        print(f"Error during cleanup: {e}")
